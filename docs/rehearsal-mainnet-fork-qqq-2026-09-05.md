# QQQ replacement mainnet-fork rehearsal — 2026-09-05

This record covers isolated Anvil forks of Robinhood Chain. No transaction was
broadcast to mainnet and no real funds moved.

## Candidate and route preflight

- Starting candidate: `b3f4e03f352d37c7c692f2a1c213633d5f16351f`
- Proposed basket: NVDA, AAPL, GOOGL, QQQ, NFLX at 2,000 bps each
- QQQ address: `0xD5f3879160bc7c32ebb4dC785F8a4F505888de68`
- Observed mainnet block: approximately `55004315`
- All five assets returned executable v3 routes in both directions.
- QQQ used v3 pool `0xd60a5d14db690b7afad71f76b108071d7175597d`
  for the recorded token-to-USDG quote.

## Governance fork — passed

- Production-shaped deployment started with deposit cap zero.
- The configured fourth basket token was the canonical QQQ address.
- Deployer, oracle keeper, rebalance keeper, Safe, and Safe owners were distinct.
- The fork-only mock Safe passed singleton, codehash, owner, and threshold checks.
- STATIC weighting and zero permissionless notional were confirmed.
- The Safe guardian paused immediately; `maxDeposit` stayed zero; guardian
  unpause reverted; deployer unpause succeeded before ownership handover.
- Both ownership transfers were scheduled and executed through the 48-hour
  timelock. The timelock became owner of the vault and oracle.
- A cap increase was separately scheduled and executed through the timelock.

## Keeper fork — partial infrastructure block

- The authorized oracle keeper posted fresh prices for all five assets.
- Keeper health returned `ok: true`, `routesHealthy: true`, fresh prices, and
  one-hop v3 buy and sell routes for every configured asset.
- A fork-only account deposited 10 USDG after the cap gate opened.
- The rebalance dry run built five 1.6-USDG v3 buy legs and retained a 2-USDG
  target reserve.
- The rehearsal found and fixed a keeper issue: swap deadlines now derive from
  the latest chain block rather than the operator wall clock, so a clock-skewed
  or time-warped environment cannot create an already-expired deadline.
- The live swap simulation did not complete on the official public RPC. Anvil
  reported `metadata is not found` while fetching uncached historical token
  storage from the upstream endpoint. NVDA's already-cached leg simulated; the
  other storage reads failed at the fork provider boundary. This was not an
  on-chain contract revert and does not establish that the remaining swaps pass.

## Result and next gate

The AMD route-family blocker is resolved by the QQQ basket change. Mainnet is
still **NO-GO**: repeat the keeper execution on an archive-capable managed RPC,
then complete the independent audit and production Safe/keeper review. The QQQ
sleeve is an ETF and overlaps economically with several single-stock sleeves;
that product tradeoff must remain explicit in customer documentation.
