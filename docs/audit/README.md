# Mag7 Index Vault — Security-Review Package

This directory is the security-review package for the vault. It describes the
system, the trust model, the invariants the code is built to hold, and where
each is tested — an internal review reference and a starting point for any
independent review.

> **Status:** unaudited pre-production build, not approved for real deposits.
> This package is prepared for an external audit; it documents the system's
> security model, invariants, and test coverage but is not itself an audit.

## 1. Scope

In scope (the only deployed Solidity):

| Contract | LOC | Role |
|---|---|---|
| [`src/IndexVault.sol`](../../src/IndexVault.sol) | ~670 | ERC-4626 vault, weighting, rebalance paths, redemptions |
| [`src/PriceOracle.sol`](../../src/PriceOracle.sol) | ~125 | Keeper-posted price + market-cap feed, staleness-checked |
| [`script/Deploy.s.sol`](../../script/Deploy.s.sol) | ~90 | Mainnet deploy + governance handover wiring |

Interfaces (`src/interfaces/IVoxRouter.sol`, `IVoxQuoter.sol`) and
`src/lib/Constants.sol` are ABI/address declarations matched to the live
`voxelithic-interfaces` package (v0.5.2); they contain no logic.

Out of scope: the Voxelithic router/quoter and pools (external, live on
Robinhood Chain 4663), the tokenized-equity ERC-20s, the OpenZeppelin 5.7.0
library (vendored under `src/lib/openzeppelin-contracts`, unmodified), and the
off-chain keeper (`keeper/`, Node.js — reviewed separately in that directory's
README; it holds no user funds and cannot bypass on-chain checks).

## 2. What the vault does

USDG in → ERC-4626 shares out; redeem shares → USDG (or, as an escape hatch,
pro-rata basket tokens). Deposited USDG sits idle until a keeper rebalances it
into a basket of tokenized equities through Voxelithic's v3 router. NAV is
priced from `PriceOracle`, never from a live quoter call (see §4).

```
User --USDG--> IndexVault (ERC-4626) --rebalance--> VoxRouter --> [v3 pools]
                   ^   ^                                              |
      guardian pause   |  totalAssets() prices basket                v
   Safe/timelock owner PriceOracle <-- keeper/post-*.mjs <-- VoxQuoter (eth_call only)
```

Two weighting modes:
- **STATIC** (default, == v1): owner-set `targetWeightBps`, summing to 10 000.
- **MARKET_CAP** (opt-in): weights derived from oracle-posted market caps via a
  single-name cap (`maxWeightBps`, default 30%) with pro-rata redistribution of
  the excess. Pure integer math, bounded to `basketLength` passes.

Two rebalance paths:
- **`rebalance` / `restoreLiquidity`** — `onlyKeeper`, trusted, the flexible
  path for reviewed moves. `restoreLiquidity` is strictly basket→USDG and works
  even with stale/absent prices.
- **`rebalancePublic`** — permissionless, disabled by default, bounded entirely
  on-chain by the oracle (due-gate, direction, no-overshoot, an oracle-implied
  `minOut` floor, a notional cap, and the 20% buffer). See §5 and
  [`threat-model.md`](./threat-model.md).

## 3. Governance

- Both contracts are `Ownable2Step` — ownership transfer is a two-step
  propose/accept, so a mistyped or wrong owner address never takes control.
- Production owner is a `TimelockController` (48 h min delay) whose sole
  proposer/executor is a Safe multisig. Every config setter is `onlyOwner`, i.e.
  behind the timelock.
- A **guardian** (the Safe) may call `pause()` *instantly* (no timelock) for
  incident response. The guardian has no other power: it cannot `unpause`, move
  funds, or change any parameter.
- `pause()` blocks deposits and both rebalance paths. It deliberately does **not**
  block `withdraw`/`redeem`/`redeemInKind` — pausing must never trap user funds.

Deploy wiring and the handover sequence are in
[`../runbook-canary.md`](../runbook-canary.md).

## 4. The central trust assumption (read this first)

`VoxQuoter.quoteExactIn` is a **revert-to-return** quoter (its ABI declares
`error QuoteResult(...)`): it can only be read via an off-chain `eth_call`, never
inside a transaction. Therefore prices are **keeper-posted** to `PriceOracle`
and read back with a staleness guard. This is the system's main trust point and
it is intentional — the same "keeper-maintained price feeds until public equity
oracles exist on this chain" caveat that Voxelithic and DOSS both state openly.

Consequences to weight:
- A malicious or compromised **oracle keeper** can misprice NAV within the
  staleness window. Mitigations: staleness reverts (`totalAssets` fails closed
  rather than mis-marking), a price-independent `redeemInKind` escape hatch,
  separate keys for the price keeper vs. the rebalance keeper, and the oracle
  keeper being a non-owner allowlist entry revocable by the timelock.
- The permissionless path's safety is **only as good as the oracle price** it
  reads; that is why it is opt-in, notional-capped, and defended in depth (§5).

## 5. Permissionless rebalance — the safety model

`rebalancePublic` lets anyone push the vault toward target, but cannot be used
to extract value, because every leg must clear all of:

1. **Enabled** — `maxPermissionlessNotional > 0` (owner/timelock opt-in).
2. **Due** — interval elapsed since `lastRebalanceAt` **or** drift ≥ threshold.
3. **Fresh anchor** — `totalAssets()` is read first, so it reverts on any stale
   held-token price before any trade is considered.
4. **Direction** — a buy only if the name is underweight; a sell only if
   overweight (`WrongDirection`).
5. **No overshoot** — `amountIn` cannot push the name past target; checked
   against **live** `balanceOf` each leg, so earlier legs can't be overshot by
   later ones (`Overshoot`).
6. **Oracle-implied `minOut` floor** — `minOut ≥ oracleExpectedOut ×
   (1 − maxSlippage)`. A self-dealing route still has to clear this
   (`MinOutBelowOracleFloor`).
7. **Notional cap** — cumulative USDG moved ≤ `maxPermissionlessNotional`
   (`NotionalCapExceeded`).
8. **Buffer** — the post-trade 20%-idle-USDG invariant must still hold.

Worst-case value loss from a single call is bounded by `maxSlippage × notional`
(invariant I3, tested).

## 6. Build & test

```bash
forge build
forge test -vvv          # 60 unit tests + 4 handler-based invariants (+1 env-gated fork)
cd keeper && npm ci && npm test
```

Invariant runs use 256 runs × 500 calls by default (`foundry.toml`).

## 7. Documents in this package

- [`handoff.md`](./handoff.md) — **start here**: the exact commit under review,
  build/reproduce steps, scope, and where to focus.
- [`threat-model.md`](./threat-model.md) — actors, assets, attack surface, and
  the mitigation for each threat.
- [`invariants.md`](./invariants.md) — the properties the system must always
  hold, and how each is enforced in code.
- [`test-coverage.md`](./test-coverage.md) — invariant → test mapping and the
  full new-surface test list.

## 8. Known design caveats (not findings)

- **Keeper-posted prices** — §4. The single largest trust assumption.
- **v3 router only** — v4 routes are rejected on-chain (calldata shape) and by
  the keeper. META (v4-only) and MSFT (unlisted) are excluded from the launch
  basket by design.
- **`maxWithdraw`/`maxRedeem` report only the idle-USDG buffer**, not full NAV;
  larger exits need a keeper `restoreLiquidity` first, or `redeemInKind`.
- **Market-cap values are an abstract self-consistent unit** (only inter-token
  ratios are consumed); the keeper documents the unit it posts.
- **`redeemInKind` transfers basket tokens directly**, so a holder can receive
  tokenized equities they must then manage; this is the deliberate price- and
  liquidity-independent exit.
