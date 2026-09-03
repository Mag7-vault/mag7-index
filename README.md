# Mag7 Index Vault — scaffold

ERC-4626 vault on Robinhood Chain (4663) that holds a basket of tokenized
equities, priced and traded through Voxelithic's live router/quoter. Deposit
USDG, get vault shares, redeem for USDG. A keeper rebalances the basket
on a schedule via Voxelithic.

The vault keeps at least 20% of NAV in idle USDG after every keeper
rebalance. `maxWithdraw` and `maxRedeem` report only that immediately liquid
amount. A withdrawal larger than the available buffer requires the keeper to
sell basket assets back to USDG first; v1 deliberately does not attempt to
construct a live route and slippage limit inside a user's redemption.

This is a **scaffold**, not an audited, deploy-ready product — see "Open
items" before anyone puts real money in it.

## What's real here

Everything address- and ABI-related was pulled from the live
`voxelithic-interfaces` npm package (v0.5.2) and cross-checked against
https://voxelithic.xyz on 2026-09-03 — not guessed:

- `src/lib/Constants.sol` — real VoxRouter/VoxQuoter addresses and every
  Robinhood Token address currently listed
- `src/interfaces/IVoxRouter.sol`, `IVoxQuoter.sol` — match the deployed ABIs
  exactly, including the custom errors

**MSFT is not tradable on this chain.** It's not in Voxelithic's token list.
The basket ships as an equal-weight six (NVDA, AAPL, TSLA, GOOGL, META,
AMZN) instead of a strict Mag7. Swap in a 7th (AMD/PLTR/COIN/MU are all
live) if the client wants a round number more than strict accuracy —
`script/Deploy.s.sol` has a comment at the top marking where to edit this.

## Architecture

```
User --USDG--> IndexVault (ERC-4626) --keeper--> VoxRouter --> [pools]
                    ^                                              |
                    |                                              v
              PriceOracle <---- keeper/post-prices.mjs <---- VoxQuoter (off-chain only)
```

The one non-obvious design decision, and the one thing to explain to the
client if they push back on it: **`VoxQuoter.quoteExactIn` can't be called
inside a transaction.** Its ABI declares `error QuoteResult(...)` — it's a
revert-to-return quoter, only safely callable via an off-chain `eth_call`.
So `IndexVault.totalAssets()` never calls the quoter directly; it reads
from `PriceOracle`, which a keeper script updates on a cron using exactly
that off-chain call. This is the same "keeper-maintained price feeds"
caveat both DOSS and Voxelithic state openly on their own sites — it's not
a shortcut we're hiding, it's how this chain currently works until public
equity oracles exist on it.

## Repo layout

```
src/
  IndexVault.sol       ERC-4626 vault: deposit/redeem, keeper-gated rebalance
  PriceOracle.sol       keeper-posted prices, staleness-checked reads
  interfaces/           IVoxRouter, IVoxQuoter — match live ABIs
  lib/Constants.sol     real addresses (router/quoter/tokens)
test/
  IndexVault.t.sol       core accounting + safety invariants
  mocks/                 MockERC20, MockVoxRouter (no live-chain dependency)
script/
  Deploy.s.sol           deploys oracle + vault, sets initial basket
keeper/
  post-prices.mjs        cron job: quote basket -> post to PriceOracle
```

## Setup

```bash
# contracts
forge install                      # pulls OZ + forge-std if not already vendored
cp .env.example .env                # fill in RPC, keys, cap
forge build
forge test -vvv

# keeper
cd keeper && npm install
```

Note: `lib/openzeppelin-contracts` and `lib/forge-std` are already vendored
in this scaffold via `git clone` (not `forge install`, since this container
has no access to `foundry.paradigm.xyz`). Re-run `forge install` normally
once you're in an environment with full network access, or just keep what's
here — it's pinned to each repo's default branch as of 2026-09-03.

## Deploy

```bash
forge script script/Deploy.s.sol \
  --rpc-url robinhood_chain \
  --broadcast \
  --verify
```

Prints the `PriceOracle` and `IndexVault` addresses — put the oracle
address into `keeper/.env` as `PRICE_ORACLE_ADDRESS`.

## Open items before this is demo-ready

1. **Pool addresses for the keeper script.** `VoxQuoter.quoteExactIn` prices
   a specific pool, not a token pair — `keeper/post-prices.mjs` has
   placeholder pool addresses that need to come from Voxelithic's registry
   (`voxelithic.xyz/registry`) or their MCP server (`npx voxelithic-mcp`,
   which exposes a "quote a pair" tool that likely does this lookup for
   you). This is the one piece we couldn't pull automatically.
2. **Rebalance route building.** `IndexVault.rebalance()` takes
   pre-built `Hop[]` calldata — nothing in this scaffold computes those
   hops yet. That's a second off-chain script in the same spirit as
   `post-prices.mjs`, querying the same quoter (or Voxelithic's HTTP API /
   MCP tools) for a route, then calling `rebalance()` with it.
3. **v4 pools are out of scope.** Half of Voxelithic's liquidity is on
   Uniswap v4 (via `VoxRouterV4`/`VoxQuoterV4`, singleton pattern). This
   scaffold only integrates the v3-style `VoxRouter`. Fine for v1 — NVDA,
   AAPL, TSLA etc. all show liquidity on the v3 side too — but worth a line
   in the pitch deck so nobody's surprised later.
4. **No audit.** Contracts are unaudited. Both DOSS and Voxelithic put an
   audit or an explicit "no audit yet" notice front and center — do the
   same before any real deposit cap goes above token-amounts.
5. **Weighting is static.** Weights are owner-set once via `setBasket()`.
   Market-cap weighting, or a self-rebalancing trigger, is a real v2 item,
   not a v1 blocker.

## Demo script (for the client pitch)

1. Deploy with a small cap (the `.env.example` default mirrors DOSS's
   $10k launch-week cap)
2. `deposit()` USDG, show shares minted 1:1 at NAV
3. Run `keeper/post-prices.mjs` once, show real prices land in `PriceOracle`
4. Call `rebalance()` with one real hop, show the basket token land in the
   vault on Blockscout and the 20% USDG buffer remain in the vault
5. `redeem()` within the reported `maxRedeem()`, show USDG come back out —
   including a redeem-while-paused call. For a larger exit, first run a
   basket-to-USDG rebalance to refill the buffer
