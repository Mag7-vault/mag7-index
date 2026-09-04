# Mag7 Index Vault

ERC-4626 vault on Robinhood Chain (4663) that holds a basket of tokenized
equities, priced and traded through Voxelithic's live router/quoter. Deposit
USDG, get vault shares, redeem for USDG. A keeper rebalances the basket
on a schedule via Voxelithic.

The vault keeps at least 20% of NAV in idle USDG after every keeper
rebalance. `maxWithdraw` and `maxRedeem` report only that immediately liquid
amount. A withdrawal larger than the available buffer requires the keeper to
sell basket assets back to USDG first; v1 deliberately does not attempt to
construct a live route and slippage limit inside a user's redemption.
If prices are stale or the keeper is unavailable, `redeemInKind()` remains a
price-independent escape hatch that returns the holder's pro-rata USDG and
basket tokens directly. A keeper can also use the strictly basket-to-USDG
`restoreLiquidity()` path without relying on fresh oracle data.

This is an **unaudited pre-production build**, not approved for real deposits.

## What's real here

Everything address- and ABI-related was pulled from the live
`voxelithic-interfaces` npm package (v0.5.2) and cross-checked against
https://voxelithic.xyz on 2026-09-03 — not guessed:

- `src/lib/Constants.sol` — real VoxRouter/VoxQuoter addresses and every
  Robinhood Token address currently listed
- `src/interfaces/IVoxRouter.sol`, `IVoxQuoter.sol` — match the deployed ABIs
  exactly, including the custom errors

**Two Mag7 names can't be held on a v3-only vault today.** MSFT isn't in
Voxelithic's token list at all, and META (listed) only quotes on a v4 pool —
IndexVault v1 executes v3 routes only. The basket therefore ships as an
equal-weight five (NVDA, AAPL, TSLA, GOOGL, AMZN), each with a live v3 USDG
pool. To grow it, add a name with a v3 venue — AMD, PLTR, MU, and NFLX are all
live v3 (COIN has no USDG pool and TSM is v4-only as of 2026-09-04).
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
  voxelithic.mjs         validated live API adapter and v3 route conversion
  post-prices.mjs        quote basket -> post to PriceOracle
  rebalance.mjs          dry-run-first allocation/liquidity route builder
  health.mjs             machine-readable RPC/API/oracle/buffer health check
```

## Setup

```bash
# contracts
forge install                      # pulls OZ + forge-std if not already vendored
cp .env.example .env                # fill in addresses and scoped keys
forge build
forge test -vvv

# keeper
cd keeper && npm ci && npm test
```

Note: `lib/openzeppelin-contracts` and `lib/forge-std` are already vendored
in this scaffold via `git clone` (not `forge install`, since this container
has no access to `foundry.paradigm.xyz`). Re-run `forge install` normally
once you're in an environment with full network access, or just keep what's
here — it's pinned to each repo's default branch as of 2026-09-03.

## Deploy

```bash
forge script script/Deploy.s.sol \
  --rpc-url robinhood_mainnet \
  --broadcast \
  --verify
```

Prints the `PriceOracle` and `IndexVault` addresses — put the oracle
address into `keeper/.env` as `PRICE_ORACLE_ADDRESS`.

## Live route status

Pool discovery and route construction now use Voxelithic's live HTTP API.
`keeper/routes.snapshot.json` records the 2026-09-04 discovery result, while
every executable keeper run fetches fresh routes and `minOut` values. All five
basket names — NVDA, AAPL, TSLA, GOOGL, AMZN — resolved to v3 pools. META
resolved only to a v4 pool, so it is excluded from the v1 basket; the keeper
still fails closed on any v4 route rather than submitting incompatible calldata.

## Testnet

Robinhood mainnet is chain `4663`; testnet is `46630`. The canonical tokens
and Voxelithic contracts used here are published for mainnet, not testnet.
`DeployTestnetDemo.s.sol` therefore deploys a prominently labeled demo-token
and deterministic-router stack for mechanics testing only. It exercises a
10 USDG deposit, five buys, and the 20% buffer with a 1,000 demo-USDG cap:

```bash
forge script script/DeployTestnetDemo.s.sol:DeployTestnetDemo \
  --rpc-url robinhood_testnet --broadcast
```

This does not count as a Voxelithic integration test. The fork test does verify
the canonical mainnet contract code and metadata without moving funds.

## Open items before real-money launch

1. Optional: add `VoxRouterV4` execution to expand beyond v3-only venues
   (would re-enable META and unlock names like TSM). The equal-weight five
   already reaches full allocation on v3 alone, so this is growth, not a blocker.
2. Obtain an independent smart-contract/economic audit and remediate findings.
3. Move owner powers to a Safe/timelock and run keeper keys from a managed
   signer with alerting; see `keeper/README.md`.
4. Complete a funded official-testnet demo, then a tiny mainnet canary after
   explicit approval. Testnet currently validates mechanics, not Voxel routes.
5. Static weighting remains intentional v1 scope; market-cap weights and
   permissionless triggers are v2 work.

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
