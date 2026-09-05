# Mainnet-fork rehearsal — 2026-09-05

This record covers an isolated Anvil fork of Robinhood Chain. No transaction
was broadcast to mainnet and no real funds moved.

## Candidate and fork

- Starting candidate: `9676356bf2b28411bcc18cff1bfd0ce70b077a76`
- Fork chain ID: `4663`
- Observed mainnet blocks: approximately `54994023`–`54994035`
- Canonical USDG and VoxRouter constants resolved successfully.

## Passed

- Production-shaped deployment started with a zero deposit cap.
- Deployer, oracle keeper, rebalance keeper, Safe, and Safe owners were distinct.
- Safe proxy codehash, singleton, owner count, and threshold validation passed
  against a fork-only mock Safe.
- The vault deployed with five 2,000-bps targets, STATIC weighting, and
  permissionless rebalancing disabled.
- The Safe guardian paused immediately; `maxDeposit` became zero; guardian
  unpause reverted; deployer unpause succeeded before handover.
- Both ownership transfers were scheduled through the 48-hour timelock, the
  fork clock advanced, and execution made the timelock owner of both vault and
  oracle.
- The authorized oracle keeper posted all five prices. Oracle freshness and the
  empty-vault reserve check were healthy.

## Blocking result

The route preflight failed before any deposit cap was opened: AMD resolved as
`AMD -> SPY -> USDG` through Voxelithic v4. `IndexVault` v1 only executes v3
hops. NVDA, AAPL, GOOGL, and NFLX remained bidirectionally executable through
v3 during the same check.

The updated keeper health check correctly returned `ok: false` and
`routesHealthy: false`. The rehearsal stopped under the runbook abort criteria;
no fork deposit or rebalance execution was attempted.

## Limitations and next gate

The mock Safe is only a fork harness and does not prove production Safe hosting,
signer custody, or transaction-service availability. Before external audit and
mainnet deployment, choose one of these product changes:

1. replace AMD with an asset that has stable bidirectional v3 routes;
2. reduce or redesign the basket; or
3. implement, test, and independently audit v4 execution.

Repeat the entire rehearsal against the final basket and a verified production
Safe configuration. A passing rehearsal does not replace the independent audit.
