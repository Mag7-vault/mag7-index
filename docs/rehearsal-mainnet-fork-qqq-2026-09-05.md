# QQQ replacement mainnet-fork rehearsal — 2026-09-05

This record covers isolated Anvil forks of Robinhood Chain. No transaction was
broadcast to mainnet and no real funds moved.

## Candidate and route preflight

- Frozen code candidate: `e1c7d91fd8dfa7818ef639c77aa3809903a54dc5`
- Proposed basket: NVDA, AAPL, GOOGL, QQQ, NFLX at 2,000 bps each
- QQQ address: `0xD5f3879160bc7c32ebb4dC785F8a4F505888de68`
- Completed archive-fork block: `55140999`
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

## Keeper fork — passed on archive RPC

- The authorized oracle keeper posted fresh prices for all five assets.
- Keeper health returned `ok: true`, `routesHealthy: true`, fresh prices, and
  one-hop v3 buy and sell routes for every configured asset.
- A fork-only account deposited 10 USDG after the cap gate opened.
- The rebalance dry run built five 1.6-USDG v3 buy legs and retained a 2-USDG
  target reserve.
- The five-leg rebalance passed its static preflight and executed on the fork in
  transaction
  `0xed414d5b729776408f09783e2942e216a9080b0f5fa71f26bc3303d61ab3347d`.
  Post-trade health reported `ok: true`, 2 USDG idle, approximately 9.94 USDG
  NAV, fresh prices, and healthy bidirectional v3 routes for all five assets.
- A `restoreLiquidity` dry run built two basket-to-USDG sell legs. The execution
  sold NVDA and AAPL and confirmed in transaction
  `0xcabc1bc2c64678889ae629a721495acfa40c4a36dbd693c71f87fe1e91433fb6`,
  raising idle liquidity from 2 USDG to approximately 5.000185 USDG.
- A subsequent standard 3-USDG withdrawal — larger than the original idle
  balance — confirmed in transaction
  `0xbf3849945fe0a8e0dce240750c7d4491241c9bcd3a82a2a271356706b76193ec`.
  Final health remained `ok: true`, with approximately 2.000185 USDG idle and
  the reserve requirement satisfied.
- The rehearsal found and fixed a keeper issue: swap deadlines now derive from
  the latest chain block rather than the operator wall clock, so a clock-skewed
  or time-warped environment cannot create an already-expired deadline.
- The Voxelithic quote API intermittently returned invalid zero or malformed
  quote fields during the sell-down attempts. The keeper failed closed before
  transaction submission each time. Repeated direct sampling returned valid
  quotes and the unchanged keeper completed on a bounded retry. Treat recurring
  quote-shape errors as an operational alert; never relax quote validation.

## Result and next gate

The AMD route-family blocker is resolved by the QQQ basket change, and the
archive-RPC keeper execution gate is now complete. Mainnet is still **NO-GO**
until the independent external audit approves the frozen candidate and the
production keeper/operator review is complete. The QQQ sleeve is an ETF and
overlaps economically with several single-stock sleeves; that product tradeoff
must remain explicit in customer documentation.
