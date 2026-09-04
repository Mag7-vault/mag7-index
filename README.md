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
  IndexVault.sol       ERC-4626 vault: deposit/redeem, STATIC + MARKET_CAP
                       weighting, keeper + permissionless rebalance, guardian pause
  PriceOracle.sol       keeper-posted prices + market caps, staleness-checked reads
  interfaces/           IVoxRouter, IVoxQuoter — match live ABIs
  lib/Constants.sol     real addresses (router/quoter/tokens)
test/
  IndexVault.t.sol            v1 accounting + safety invariants (STATIC default)
  IndexVaultV2.t.sol          governance, market-cap, permissionless coverage
  IndexVault.invariant.t.sol  handler-based invariants
  RobinhoodFork.t.sol         live mainnet metadata check (env-gated)
  mocks/                      MockERC20, MockVoxRouter (no live-chain dependency)
script/
  Deploy.s.sol               deploys oracle + vault + timelock, sets basket + guardian
  DeployTestnetDemo.s.sol    synthetic demo stack for testnet/local mechanics
keeper/
  voxelithic.mjs         validated live API adapter and v3 route conversion
  post-prices.mjs        quote basket -> post to PriceOracle
  post-market-caps.mjs   fetch caps (pluggable source + fallback) -> PriceOracle
  rebalance.mjs          dry-run-first allocation/liquidity route builder
  health.mjs             machine-readable RPC/API/oracle/buffer health check
  notify.mjs             non-fatal Slack/Discord alerting
  signer.mjs             raw-key or pluggable KMS signer
docs/
  audit/                 auditor package (scope, threat model, invariants, tests)
  runbook-testnet.md     funded testnet demo runbook
  runbook-canary.md      mainnet canary runbook (approval-gated)
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

For a real mainnet launch, don't run this bare command — follow
[docs/runbook-canary.md](docs/runbook-canary.md), which sets `SAFE_ADDRESS` so the
deploy wires the timelock + guardian and hands ownership over behind approval
gates.

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

## Launch-hardening status

This build folds the former **v2** scope (market-cap weighting + permissionless
triggers) and the governance/keeper hardening into the current codebase, so they
are audited together rather than bolted on afterward. Everything marked
**shipped** below is code-complete and tested here — but still **unaudited**, and
it ships **dormant** (STATIC equal-weight five, permissionless disabled,
MARKET_CAP off) until enabled through the timelock after real deposits are live.

**Shipped in code (this repo, tested):**

- **Governance** — both contracts are `Ownable2Step`; `script/Deploy.s.sol` wires
  an OZ `TimelockController` (48 h) whose sole proposer/executor is a Safe
  multisig, plus an instant guardian `pause()` (guardian = Safe; `unpause` and
  every setter stay behind the timelock). See
  [docs/audit/README.md](docs/audit/README.md) §3.
- **Managed keeper signer + alerting** — pluggable signer (`KEEPER_SIGNER_KIND`,
  raw key or a KMS module) and non-fatal webhook alerts wired into the keeper's
  health, price, rebalance, and market-cap jobs. See
  [keeper/README.md](keeper/README.md).
- **Market-cap weighting** — opt-in `MARKET_CAP` mode: oracle-fed caps → a
  single-name cap (30%) with pro-rata redistribution, pure integer math. Default
  stays STATIC, so existing behavior is unchanged.
- **Permissionless triggers** — `rebalancePublic`, disabled by default and bounded
  entirely on-chain (due-gate, direction, no-overshoot, an oracle-implied `minOut`
  floor, a notional cap, and the 20% buffer). See
  [docs/audit/README.md](docs/audit/README.md) §5.
- **Audit package** — scope, threat model, invariants, and an invariant→test map
  under [docs/audit/](docs/audit/), plus handler-based invariant tests and full
  unit coverage of the new surface. The internal audit-prep review's findings are
  remediated.

**Remains before real money (your action, approval-gated — runbooks provided):**

1. **Independent audit** — engage an external firm against this commit and
   remediate their findings. `docs/audit/` is prepared for exactly that; it is a
   package *for* an audit, not itself one.
2. **Funded testnet demo** — follow
   [docs/runbook-testnet.md](docs/runbook-testnet.md), including its mainnet-fork
   rehearsal (the keeper scripts need live Voxelithic and can't run on testnet
   `46630`).
3. **Mainnet canary** — follow [docs/runbook-canary.md](docs/runbook-canary.md):
   create the Safe, hand ownership to the timelock, deploy at a tiny cap behind
   explicit go/no-go gates, soak, then stage the cap up. I do not create the Safe,
   hold keys, or broadcast — every gate is yours.
4. **Optional — v4 execution** — add `VoxRouterV4` routing to re-enable META and
   unlock names like TSM. The equal-weight five already reaches full allocation on
   v3 alone, so this is growth, not a blocker.

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
