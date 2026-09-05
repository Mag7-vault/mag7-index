# Test Coverage — Mag7 Index Vault

65 tests total: 60 unit tests across three suites, 4 handler-based invariants, and one env-gated fork test. Run:

```bash
forge test -vvv                 # all Solidity tests + invariants
cd keeper && npm test           # 22 keeper adapter tests (mocked, no network)
```

Suites:
- [`test/IndexVault.t.sol`](../../test/IndexVault.t.sol) — 23 v1 accounting &
  safety tests (unchanged by the v2 work; STATIC mode is the default).
- [`test/IndexVaultV2.t.sol`](../../test/IndexVaultV2.t.sol) — 30 tests for the
  launch-hardening + v2 surface.
- [`test/DeployValidation.t.sol`](../../test/DeployValidation.t.sol) — 7 deploy-time
  config-validation tests: mainnet Safe/timelock wiring, keeper/deployer/Safe role
  separation, Safe codehash/singleton/threshold checks, and the cap-starts-at-zero guard.
- [`test/IndexVault.invariant.t.sol`](../../test/IndexVault.invariant.t.sol) — 4
  handler-based invariants (256 runs × 500 calls each by default).
- [`test/RobinhoodFork.t.sol`](../../test/RobinhoodFork.t.sol) — 1 fork test
  verifying live mainnet contract code/metadata; skipped without an RPC.

## Invariant → test map

| Invariant | Primary tests |
|---|---|
| I1 buffer after rebalance | `test_rebalanceCannotSpendMinimumUsdgBuffer`, `test_rebalanceBufferUsesHigherPostTradeNav`, `test_permissionlessHappyPath`, `test_permissionlessBoundedLossAtFloor` |
| I2 weights sum 10 000 / ≤ cap | `test_marketCapCapsAndRedistributes`, `test_marketCapProportionalWhenUncapped`, `test_marketCapRedistributesRoundingDust`, `test_setWeightModeRevertsWhenCapInfeasible`, `test_setMaxWeightBpsRevertsWhenItBreaksFeasibility`, `test_setBasketRevertsWhenShrinkingBelowFeasibilityInMarketCapMode` |
| I3 permissionless bounded loss | `test_permissionlessNavConservedAtOracleRate`, `test_permissionlessBoundedLossAtFloor`, `invariant_sharesNeverExceedAssets` |
| I4 in-kind pro-rata, oracle-free | `test_redeemInKindWorksWithMissingPrice`, `test_redeemInKindWorksWhilePausedWithStalePrice`, `test_redeemInKindHonorsDelegatedAllowance`, `invariant_inKindPreviewMatchesBalances` |
| I5 pause never blocks exits | `test_redeemWorksWhilePaused`, `test_redeemInKindWorksWhilePausedWithStalePrice` |
| I6 config owner-gated / guardian pause-only | `test_nonGuardianNonOwnerCannotPause`, `test_guardianCannotUnpause`, `test_guardianHoldsNoConfigPower`, `invariant_configImmutableWithoutOwner` |
| I7 solvency (shares ≤ assets) | `invariant_sharesNeverExceedAssets`, `invariant_sharesHeldByActorsOnly` |
| I8 two-step ownership | `test_vaultOwnable2StepHandover`, `test_oracleOwnable2StepHandover` |
| I9 NAV fails closed on stale price | `test_totalAssetsRevertsOnStalePrice`, `test_redeemInKindWorksWithMissingPrice`, `test_marketCapModeRevertsOnStaleCap`, `test_postPricesRejectsZeroPrice`, `test_zeroPriceRevertsWholeBatchLeavingNothingMarked` |

## Permissionless rebalance — rejection matrix

Each on-chain guard has a dedicated negative test:

| Guard | Error | Test |
|---|---|---|
| Path disabled | `PermissionlessDisabled` | `test_permissionlessRevertsWhenDisabled` |
| Not due | `RebalanceNotDue` | `test_permissionlessRevertsWhenNotDue` |
| Wrong direction | `WrongDirection` | `test_permissionlessRevertsOnWrongDirection` |
| Overshoot target | `Overshoot` | `test_permissionlessRevertsOnOvershoot` |
| `minOut` below floor | `MinOutBelowOracleFloor` | `test_permissionlessRevertsWhenMinOutBelowOracleFloor` |
| Notional cap | `NotionalCapExceeded` | `test_permissionlessRevertsWhenNotionalExceeded` |
| Paused | `EnforcedPause` | `test_permissionlessBlockedWhenPaused` |
| Happy path (non-keeper caller) | — | `test_permissionlessHappyPath` |
| Due-state views | — | `test_maxDriftAndDueViewsOnFreshVault`, `test_notDueOnTargetThenDueAfterInterval` |

## Handler-based invariant harness

[`InvariantHandler`](../../test/IndexVault.invariant.t.sol) drives random
sequences of non-owner actions: `deposit`, `redeemStandard`, `redeemKind`,
`keeperBuy`, `publicBuy`, and `attackerConfig` (which attempts every owner-only
setter and `pause` from unauthorized accounts each call). Prices are posted once
and time is not advanced, so oracle reads stay fresh and `totalAssets()` is
always callable — staleness paths are covered by the unit tests instead. Latest
run: 4 invariants × 256 runs × 500 calls, 0 failures, 0 unexpected reverts.

## Keeper tests (`keeper/`, node:test)

`notify` (webhook alerting, non-fatal), `signer` (raw + module/KMS signer
resolution), `marketcap` (provider parsing + snapshot/equal-weight fallback
chain), and `voxelithic` (v3 route validation, v4 rejection, price-impact and
token-address checks, plus bidirectional v3 route-family preflight). 22 tests,
all mocked — no network access required.

## Gaps / notes

- Fork test requires a Robinhood Chain RPC; run it against a pinned block before
  sign-off to confirm live router/token metadata still matches.
- Economic assumptions of the permissionless path (slippage/notional/interval
  sizing) are parameter choices for review, not code correctness — see
  [`threat-model.md`](./threat-model.md) T5.
- The off-chain keeper's data sourcing is out of on-chain scope; its fallback
  and alerting behavior are tested in `keeper/` but are operational, not
  trustless, guarantees.
