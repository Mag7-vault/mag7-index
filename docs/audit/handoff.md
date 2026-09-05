# Security Review Handoff — Mag7 Index Vault

This document pins the exact code under review, how to build and reproduce our
results, what to scrutinize, and what we already know. The deeper material lives
in the rest of this directory ([README.md](./README.md),
[threat-model.md](./threat-model.md), [invariants.md](./invariants.md),
[test-coverage.md](./test-coverage.md)).

---

## 1. The ask

An independent **smart-contract security + economic** audit of the on-chain
system below, followed by remediation review after confirmed findings are
fixed. This is a small, self-contained surface (~900 lines of first-party
Solidity, no external Solidity deps beyond vendored OpenZeppelin). The system
is **unaudited pre-production** and has **never held real funds**.

## 2. Exact code under review

| | |
|---|---|
| **Repo** | `Aeyod7/mag7-index` (private GitHub) |
| **Commit** | `e1c7d91fd8dfa7818ef639c77aa3809903a54dc5` |
| **Branch** | `fix/audit-remediation-2026-09-04` |
| **Baseline** | this branch's changes are the delta from `main` @ `b45271e` (§5) |

Read this handoff from the branch tip, then check out code commit
`e1c7d91fd8dfa7818ef639c77aa3809903a54dc5`. It contains the final in-scope
implementation; subsequent commits may update review documentation only.
`482c1bc` and `92ade23` are historical review/remediation references only: both
`src/` and `script/` changed afterward. Cite the pinned code commit for every
code location and do not audit a moving branch tip.

**Access:** the repo is private. We will either add the audit team as
read-collaborators or send a `git archive`/bundle of the pinned commit — tell us
which you prefer.

## 3. Build & reproduce (our results)

Toolchain we used:
- **Foundry** `forge 1.7.1` (solc **0.8.26**, `optimizer = true`, `runs = 200`,
  `via_ir = false` — see [foundry.toml](../../foundry.toml))
- **Node.js ≥ 20** for the off-chain keeper (ESM, `node:test`, `ethers` v6)

```bash
# Solidity
forge build
forge fmt --check
forge test -vvv        # expect: 65 passed, 0 failed
                       # (23 v1 + 30 v2 + 7 deploy-validation unit, 4 handler-based invariants, 1 env-gated fork)

# Keeper (off-chain, mocked — no network)
cd keeper && npm ci && npm test   # expect: 22 passed, 0 failed
```

The one fork test (`test/RobinhoodFork.t.sol`) is skipped without a Robinhood
Chain RPC; it only checks live contract metadata and moves no funds. Invariant
runs use Foundry defaults (256 runs × 500 calls per property).

## 4. Scope

**In scope** (the only first-party deployed Solidity):

| Contract | Lines | Role |
|---|---:|---|
| [`src/IndexVault.sol`](../../src/IndexVault.sol) | 678 | ERC-4626 vault, weighting, both rebalance paths, redemptions, guardian/pause |
| [`src/PriceOracle.sol`](../../src/PriceOracle.sol) | 130 | keeper-posted price + market-cap feed, staleness-checked reads |
| [`script/Deploy.s.sol`](../../script/Deploy.s.sol) | 206 | mainnet deploy + Safe/timelock/guardian handover wiring |

Interfaces (`src/interfaces/IVoxRouter.sol` 27, `IVoxQuoter.sol` 33) and
`src/lib/Constants.sol` (41) are ABI/address declarations matched to the live
`voxelithic-interfaces` npm package (v0.5.2); no logic.

**Out of scope:** the Voxelithic router/quoter/pools (external, live on chain
4663), the tokenized-equity ERC-20s, the vendored OpenZeppelin 5.7.0 library
(`src/lib/openzeppelin-contracts`, unmodified), and the off-chain keeper
(`keeper/`, Node.js — it holds no user funds and cannot bypass on-chain checks;
review it opportunistically, not as a trust boundary).

## 5. What changed in this branch (the delta to focus on)

This branch folds the former "v2" scope + governance hardening onto the reviewed
v1 baseline (`b45271e`). The final candidate contains broader frontend and
documentation work; the `src/`, `script/`, and `test/` delta is 12 files,
+1,883 / -34. The security-relevant deltas:

- **`IndexVault.sol` (+374 / -16)** — new permissionless `rebalancePublic` + its guards
  (`_validatePublicLeg`), `MARKET_CAP` weight mode with cap-and-redistribute
  (`_resolvedWeights`), `setRebalancePolicy`/`setWeightMode`/`setMaxWeightBps`,
  guardian + `onlyGuardianOrOwner` pause, `Ownable2Step`.
- **`PriceOracle.sol` (+60 / -2)** — market-cap feed (`postMarketCaps`/`getMarketCap`),
  zero-price rejection, `Ownable2Step`.
- **`Deploy.s.sol` (+157 / -10)** — `TimelockController(48h)` + Safe
  proposer/executor, guardian wiring, role-separation checks, zero-cap launch,
  and two-step ownership handover.
- New tests: `test/IndexVaultV2.t.sol` (644), `test/IndexVault.invariant.t.sol`
  (298).

## 6. The central trust assumption (read first)

`VoxQuoter.quoteExactIn` is a **revert-to-return** quoter (its ABI declares
`error QuoteResult(...)`): it is only readable via off-chain `eth_call`, never
inside a transaction. So NAV prices are **keeper-posted** to `PriceOracle` and
read back under a staleness guard. This is the system's principal trust point and
it is intentional (the same "keeper-maintained feeds until public equity oracles
exist on this chain" caveat Voxelithic/DOSS state openly). Full consequences and
mitigations: [README.md §4](./README.md) and [threat-model.md](./threat-model.md).

## 7. Where we most want your attention

1. **`rebalancePublic` economic safety** — the only permissionless funds-touching
   entrypoint. Can anyone extract value despite the oracle-implied `minOut` floor,
   direction/no-overshoot checks (live `balanceOf`), cumulative notional cap, and
   the 20% post-trade buffer? Please stress the unit math (USDG 6dec, equities
   18dec, price = USDG per 1e18 token units) and any multi-call / same-block or
   drift-manipulation angle. See [README.md §5](./README.md), invariants **I1/I3**.
2. **Cap-and-redistribute integer math** (`_resolvedWeights`) — sum-to-10000,
   ≤`maxWeightBps`, no overflow/underflow/div-by-zero, loop bound. Invariant **I2**.
3. **Governance** — timelock/guardian wiring, the Ownable2Step handover window,
   and that `pause` is instant while `unpause`/all setters are timelocked.
4. **Fail-closed pricing** — `totalAssets()` reverting on stale/missing/zero price
   vs. the price-independent `redeemInKind` escape hatch. Invariants **I4/I9**.
5. **Parameter sizing** — are the defaults (`maxSlippageBps`, `maxNotional`,
   `driftThresholdBps`, `minRebalanceInterval`, `maxWeightBps`, staleness windows)
   economically sane? These are choices for your judgment, not code correctness.

## 8. Disclosed residuals (please validate, don't just re-discover)

We have documented these; we want your view on whether the mitigation/sizing is
adequate, but they are not undisclosed bugs:
- **T5** — per-window `rebalancePublic` loss re-arms with genuine drift; bounded
  per call to `maxSlippage·notional`. Mitigation is conservative param sizing.
- **T6** — a compromised keeper can skew market caps within `maxWeightBps`; NAV
  and redemptions never read caps; STATIC is the default and fallback.
- **v3-only** router (v4 routes rejected on-chain), `maxWithdraw`/`maxRedeem`
  reporting only the idle buffer, and market caps being an abstract ratio-only
  unit. See [README.md §8](./README.md).

## 9. Prior review status (starting quality)

- An internal **code review** and a separate **tooling-assisted security
  pass** (diff `b45271e...482c1bc`) both completed with **no HIGH/MEDIUM
  findings**. One internal fix was already applied: `PriceOracle` now rejects a
  zero price at post time and fails closed on a stored zero in `getPrice`.
- These are our own reviews — not a substitute for yours. We expect an
  independent adversarial pass, not a confirmation of ours.

## 10. Deliverables we expect

- Severity-rated findings (with concrete exploit scenarios) against commit
  `e1c7d91fd8dfa7818ef639c77aa3809903a54dc5`.
- Review of the historical remediation record (`482c1bc` -> `92ade23`; see
  [remediation-2026-09-04.md](./remediation-2026-09-04.md)) as context, without
  treating either historical commit as the final target.
- Written confirmation that the pinned final commit, including the QQQ
  deployment basket and post-remediation changes, was the version reviewed.

## 11. Operational context (not part of the review, but useful)

The system ships **dormant**: STATIC equal-weight-five basket (NVDA, AAPL,
GOOGL, QQQ, NFLX), permissionless
rebalancing disabled (zero notional), MARKET_CAP off. Enabling each is an
owner/timelock action after launch. Mainnet deployment itself is gated behind a
Safe multisig, a 48h timelock handover, and a staged-cap canary — see
[../runbook-canary.md](../runbook-canary.md). None of that removes the need for
independent review; it is the operational envelope the code runs in.
