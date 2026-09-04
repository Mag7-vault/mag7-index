# Threat Model — Mag7 Index Vault

Scope: [`src/IndexVault.sol`](../../src/IndexVault.sol),
[`src/PriceOracle.sol`](../../src/PriceOracle.sol). This is a structured list of
who can act, what they can reach, and what stops abuse. Pair it with
[`invariants.md`](./invariants.md).

## Assets at risk

- **Deposited USDG** held idle in the vault.
- **Basket tokens** (tokenized equities) held after rebalances.
- **Share accounting** — the claim each shareholder has on the above.

## Actors and trust

| Actor | Trust | Powers |
|---|---|---|
| Owner (Timelock ← Safe) | Trusted, time-delayed | All config: basket, weighting mode, caps, rebalance policy, keepers, guardian, deposit cap, unpause, ownership transfer |
| Guardian (Safe) | Trusted, instant | `pause()` only |
| Price keeper | Semi-trusted | `postPrices`, `postMarketCaps` (oracle allowlist) |
| Rebalance keeper | Semi-trusted | `rebalance`, `restoreLiquidity` (vault allowlist) |
| Depositor / shareholder | Untrusted | deposit, withdraw, redeem, redeemInKind |
| Anyone (public) | Untrusted | `rebalancePublic` (when enabled), all views |
| Voxelithic router/pools | External | Executes swaps; can return bad prices/MEV |

Keys: the price keeper, rebalance keeper, and owner/deployer are **three
different keys**; none of the keepers is an owner. Keeper keys are runtime
secrets (KMS/HSM recommended); the owner key lives behind the Safe/timelock.

## Threats and mitigations

### T1 — Malicious/compromised rebalance keeper drains via bad `minOut`
The trusted `rebalance` path trusts caller-supplied `minOut`/`hops`. A bad
keeper could accept a terrible swap.
- **Mitigation:** keeper key is separate and revocable (`setKeeper`) by the
  timelock; guardian can `pause` instantly to stop further rebalances; the 20%
  buffer and `redeemInKind` bound depositor loss and keep an exit open. The
  trusted path is intentionally flexible — this residual risk is why the
  *permissionless* path (T5) is bounded instead.
- **Residual:** a trusted keeper can still execute a lossy allocation trade
  within a single rebalance; scope of loss is one rebalance, mitigated
  operationally (weekly cadence, alerting, small caps early).

### T2 — Compromised price keeper mis-marks NAV
Wrong prices → wrong share price on deposit/redeem.
- **Mitigation:** `getPrice` reverts on stale (default 1 h), missing, **or zero**
  price, so `totalAssets`/`deposit`/`redeem` **fail closed** rather than trade on
  a bad mark; `postPrices` also refuses to store a zero (a real equity never
  quotes at 0, so a keeper-side bug fails loudly instead of marking a held token
  to zero). `redeemInKind` needs no oracle at all. Price keys are separate and
  revocable. Staleness window is a governance parameter.
- **Residual:** within the freshness window a keeper can post a wrong-but-recent
  price. Bounded by cadence + monitoring; documented trust assumption.

### T3 — Owner turns malicious / key stolen
- **Mitigation:** owner is a 48 h `TimelockController` behind a Safe multisig, so
  any config change is publicly visible for 48 h before it can execute; the
  community/guardian can react. `Ownable2Step` prevents fat-fingering ownership
  to a dead address. The guardian can pause but cannot itself change config.
- **Residual:** a fully-compromised Safe after 48 h is game-over — inherent to
  any admin key; the delay + multisig + visibility are the control.

### T4 — Reentrancy across exit modes
`redeemInKind` transfers arbitrary basket ERC-20s (potential callback tokens)
pro-rata; a token could re-enter `deposit`/`withdraw`/`redeem`.
- **Mitigation:** `redeemInKind`, `_deposit`, `_withdraw`, and `rebalancePublic`
  share one `nonReentrant` mutex, so no cross-function reentrancy can interleave
  a partial basket transfer with another share-mutating path. Tested in
  `test_redeemInKindBlocksCrossFunctionReentrancy`.

### T5 — Public caller abuses `rebalancePublic` (self-dealing / value extraction)
The core new attack surface. An attacker supplies their own `hops`/`minOut` and
could route through a pool they control.
- **Mitigations (defense in depth, all on-chain):**
  - Disabled unless `maxPermissionlessNotional > 0`.
  - `totalAssets()` read first → reverts on any stale price (fresh anchor).
  - Due-gate (interval or drift) limits frequency.
  - Direction + no-overshoot: a leg can only *reduce* drift and never cross
    target; checked against live `balanceOf` per leg.
  - **Oracle-implied `minOut` floor:** any route, including a self-dealing one,
    must return ≥ `oracleExpectedOut × (1 − maxSlippage)`. This is the anchor
    that makes caller-supplied routing safe.
  - Notional cap on cumulative USDG moved.
  - 20% buffer re-checked post-trade.
- **Bounded loss:** ≤ `maxSlippage × notional` per call (invariant I3).
- **Residual:** while a rebalance is *due*, nothing stops several `rebalancePublic`
  calls in the same block (each nudging drift down a little), so the loss bound
  over a whole due-window is `maxSlippage × (notional needed to reach target)`,
  **not** `maxSlippage × maxPermissionlessNotional` — the notional cap bounds a
  single call, not the window. The value still cannot leave except as slippage,
  the vault ends correctly allocated, and this path is strictly safer than the
  trusted keeper path (which has no on-chain slippage floor at all). Sized by
  `maxSlippage` and `minRebalanceInterval`; a stronger per-window accumulator is
  a possible hardening flagged for the audit. Start small.

### T6 — MARKET_CAP weighting manipulated or wedged
Market caps are keeper-posted; a bad/stale cap could skew weights or brick the
mode.
- **Mitigation:** `getMarketCap` staleness-reverts (default 1 day); a stale cap
  only blocks a market-cap-weighted rebalance — it never affects NAV or
  redemptions (those never read caps). Single-name cap + redistribution bounds
  concentration even if one cap is inflated. `_requireWeightFeasible` refuses a
  cap/basket combo that can't sum to 10 000 (`InfeasibleWeightCap`). Weights are
  clamped to `uint16` and provably sum to 10 000 (I2).
- **Residual:** within freshness, skewed caps skew target weights; bounded by
  `maxWeightBps`. STATIC mode is the fallback and the default. Note the on-chain
  staleness guard is **not** the only backstop the operator relies on: the
  off-chain keeper (`keeper/marketcap/`) falls back to a *fresh* equal-weight
  sentinel on a data-source outage rather than letting caps go stale, so
  `getMarketCap` will not revert in that case — the vault instead drifts toward
  equal weight (the safe neutral, identical to the launch STATIC config) and the
  keeper alerts. Concentration stays bounded by `maxWeightBps` throughout.

### T7 — Pause traps user funds
- **Mitigation:** by design `withdraw`/`redeem`/`redeemInKind` carry **no**
  `whenNotPaused` guard (I5). Pause blocks only deposits and rebalances.

### T8 — Basket removal strands assets
Removing a token the vault still holds would orphan value from accounting.
- **Mitigation:** `setBasket` reverts (`BasketTokenStillHeld`) if a removed
  token has a nonzero balance; the keeper must sell it to USDG first.

### T9 — Deposit-cap / share-inflation griefing
- **Mitigation:** ERC-4626 with OZ virtual-shares (offset 0) resists first-depositor
  inflation; `depositCap` bounds early exposure; `convertToAssets(supply) ≤
  totalAssets()` holds at all times (invariant, fuzzed).

## Explicitly out of scope for on-chain defense

- Correctness/honesty of the external Voxelithic pools and router.
- The off-chain keeper's data sources (mitigated by fallback + alerting in
  `keeper/`, but not an on-chain guarantee).
- Censorship of keeper transactions (mitigated by the permissionless path +
  `redeemInKind`).
