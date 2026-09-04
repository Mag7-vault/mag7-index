# Invariants — Mag7 Index Vault

The properties the system is built to hold, how each is enforced in code, and
how each is tested. Handler-based fuzzing lives in
[`test/IndexVault.invariant.t.sol`](../../test/IndexVault.invariant.t.sol);
targeted cases in [`test/IndexVaultV2.t.sol`](../../test/IndexVaultV2.t.sol) and
the v1 suite [`test/IndexVault.t.sol`](../../test/IndexVault.t.sol).

## I1 — Idle-USDG buffer after any rebalance
After a successful `rebalance` **or** `rebalancePublic`, idle USDG ≥ 20% of the
buffer NAV (`max(navBefore, navAfter) × MIN_IDLE_USDG_BPS`).
- **Enforced:** end of both functions
  ([IndexVault.sol:394-398](../../src/IndexVault.sol#L394-L398),
  [IndexVault.sol:468-472](../../src/IndexVault.sol#L468-L472)),
  `InsufficientIdleLiquidity` on failure, `Math.Rounding.Ceil` on the minimum.
- **Note:** this is a *post-rebalance* property, not a global one — a standard
  `redeem` legitimately draws the buffer down (that is what `maxWithdraw` caps
  it to); the buffer is re-established at the next rebalance.
- **Tests:** `test_rebalanceCannotSpendMinimumUsdgBuffer`,
  `test_rebalanceBufferUsesHigherPostTradeNav`, `test_permissionlessHappyPath`
  (buffer holds), `test_permissionlessBoundedLossAtFloor`.

## I2 — Resolved weights sum to 10 000 and respect the cap
`_resolvedWeights()` returns a vector summing to exactly 10 000; in MARKET_CAP
mode each entry ≤ `maxWeightBps`.
- **Enforced:** STATIC weights validated to sum to 10 000 in `setBasket`
  ([IndexVault.sol:177](../../src/IndexVault.sol#L177)); MARKET_CAP cap-and-
  redistribute clamps to `maxWeightBps` and hands the floor-rounding deficit back
  to names with room ([IndexVault.sol:311-350](../../src/IndexVault.sol#L311-L350));
  `_requireWeightFeasible` rejects an unsatisfiable cap
  ([IndexVault.sol:363-367](../../src/IndexVault.sol#L363-L367)).
- **Tests:** `test_marketCapProportionalWhenUncapped`,
  `test_marketCapCapsAndRedistributes` (asserts sum == 10 000 and each ≤ cap),
  `test_marketCapRedistributesRoundingDust`,
  `test_setWeightModeRevertsWhenCapInfeasible`,
  `test_setMaxWeightBpsRevertsWhenItBreaksFeasibility`,
  `test_setBasketRevertsWhenShrinkingBelowFeasibilityInMarketCapMode`.

## I3 — Permissionless rebalance has bounded loss
A single `rebalancePublic` call reduces NAV by at most
`maxPermissionlessSlippageBps × tradedNotional`.
- **Enforced:** the oracle-implied `minOut` floor per leg
  ([IndexVault.sol:510-511](../../src/IndexVault.sol#L510-L511)) plus the notional
  cap ([IndexVault.sol:458-460](../../src/IndexVault.sol#L458-L460)).
- **Scope:** this is a *per-call* bound. The notional cap limits one call, not a
  whole due-window (several calls may run while due), so window loss is bounded by
  `maxSlippage × notional-to-target`, never more — see threat-model T5.
- **Tests:** `test_permissionlessNavConservedAtOracleRate` (0 loss at oracle
  rate), `test_permissionlessBoundedLossAtFloor` (loss == bound at the floor),
  and invariant `invariant_sharesNeverExceedAssets` (no call inflates share
  value).

## I4 — In-kind redemption is exactly pro-rata, oracle-independent
`redeemInKind(shares)` returns `floor(balance × shares / supply)` of USDG and of
each basket token, regardless of oracle freshness.
- **Enforced:** `previewRedeemInKind` uses only balances and supply, no oracle
  read ([IndexVault.sol:608-617](../../src/IndexVault.sol#L608-L617)).
- **Tests:** `test_redeemInKindWorksWithMissingPrice`,
  `test_redeemInKindWorksWhilePausedWithStalePrice`,
  `test_redeemInKindHonorsDelegatedAllowance`, and invariant
  `invariant_inKindPreviewMatchesBalances`.

## I5 — Pause never blocks exits
`withdraw`, `redeem`, and `redeemInKind` succeed while paused (subject to their
ordinary liquidity/oracle rules); only deposits and rebalances are paused.
- **Enforced:** no `whenNotPaused` on the exit paths (deliberate, noted at
  [IndexVault.sol:666-668](../../src/IndexVault.sol#L666-L668)).
- **Tests:** `test_redeemWorksWhilePaused`,
  `test_redeemInKindWorksWhilePausedWithStalePrice`.

## I6 — Config is owner-gated; guardian can only pause
No non-owner can change any parameter; the guardian can `pause` and nothing
else.
- **Enforced:** every setter is `onlyOwner`; `pause` is `onlyGuardianOrOwner`;
  `unpause` is `onlyOwner`
  ([IndexVault.sol:262-268](../../src/IndexVault.sol#L262-L268)).
- **Tests:** `test_nonGuardianNonOwnerCannotPause`,
  `test_guardianCannotUnpause`, `test_guardianHoldsNoConfigPower`, and invariant
  `invariant_configImmutableWithoutOwner` (fuzzed adversary attempts every
  setter each call; config never changes).

## I7 — Solvency: shares never claim more than the vault holds
`convertToAssets(totalSupply()) ≤ totalAssets()` at all times.
- **Enforced:** ERC-4626 share math with OZ virtual shares (no share minted
  without backing assets; rebalances never mint shares).
- **Tests:** invariant `invariant_sharesNeverExceedAssets`, plus
  `invariant_sharesHeldByActorsOnly` (shares only ever held by depositors).

## I8 — Ownership handover is two-step
Ownership only moves when the *pending* owner calls `acceptOwnership`; until
then the current owner retains full control.
- **Enforced:** `Ownable2Step` on both contracts.
- **Tests:** `test_vaultOwnable2StepHandover`, `test_oracleOwnable2StepHandover`.

## I9 — NAV fails closed on stale/missing/zero prices
`totalAssets()` reverts rather than mis-mark if any held basket token's price is
missing, stale, or zero; the market-cap feed is independent and looser.
- **Enforced:** `getPrice` reverts on `updatedAt == 0`, `priceUsdg == 0`, or
  staleness ([PriceOracle.sol:108-116](../../src/PriceOracle.sol#L108-L116)), and
  `postPrices` refuses to store a zero
  ([PriceOracle.sol:89-96](../../src/PriceOracle.sol#L89-L96)); `totalAssets`
  reads `getPrice` per held token.
- **Tests:** `test_totalAssetsRevertsOnStalePrice`,
  `test_redeemInKindWorksWithMissingPrice`, `test_marketCapModeRevertsOnStaleCap`,
  `test_postPricesRejectsZeroPrice`,
  `test_zeroPriceRevertsWholeBatchLeavingNothingMarked`.
