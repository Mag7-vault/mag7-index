# Runbook — Mainnet Canary

> **Who runs this:** you (the operator), with the Safe signers. Claude prepared
> this runbook and will help read state, but does **not** create the Safe, hold
> keys, broadcast mainnet transactions, or move funds. Every step that touches
> mainnet is **gated on your explicit go/no-go**.
>
> **Precondition:** the independent external audit is complete, its findings
> are remediated, and the [testnet demo](./runbook-testnet.md) (incl. the
> mainnet-fork rehearsal §5) passed. Do **not** start the canary before all three
> are true.

Chain: Robinhood `4663`. Asset: canonical USDG. Router: canonical VoxRouter
(v3). Everything ships **dormant**: STATIC equal-weight five, permissionless
disabled (zero notional), MARKET_CAP off.

---

## Approval gates at a glance

| Gate | Before you… | Requires |
|---|---|---|
| **A** | broadcast the deploy | operator go + params double-checked |
| **B** | hand ownership to the timelock | deploy verified on-explorer |
| **C** | open deposits (raise cap above 0) | guardian-pause smoke test passed |
| **D** | each staged cap raise | soak criteria (§8) met at current cap |
| **E** | enable permissionless / MARKET_CAP | separate feed+policy validation |

Never collapse two gates into one action. If any check in a gate fails, stop.

---

## 1. Create the Safe (you, in the Safe UI)

- Create a Safe multisig on chain `4663` with a real signer threshold (e.g. 3/5).
  Signers on hardware wallets. This Safe becomes both the **timelock's sole
  proposer/executor** and the **instant-pause guardian**.
- Record `SAFE_ADDRESS`. It must **not** equal any keeper or deployer address.
- Independently verify the Safe proxy runtime and singleton against an approved
  Safe deployment. Record that proxy runtime hash as `EXPECTED_SAFE_CODEHASH`
  and its singleton as `EXPECTED_SAFE_SINGLETON`; do not derive approval solely
  from the candidate Safe address. The deploy script also verifies the on-chain
  owner list, a threshold of at least 2, and role separation.

## 2. Keys and env

- [ ] **Three distinct keys, none reused:** `DEPLOYER_PRIVATE_KEY` (used once,
      then retired), `ORACLE_KEEPER_PRIVATE_KEY`, `REBALANCE_KEEPER_PRIVATE_KEY`.
      Neither keeper key is the deployer or a Safe signer.
- [ ] Keeper keys in a secret manager / KMS. If using KMS, set
      `KEEPER_SIGNER_KIND=module` + `KEEPER_SIGNER_MODULE` (see
      [keeper/signers/aws-kms.example.mjs](../keeper/signers/aws-kms.example.mjs));
      the raw keys then stay unused. Keys never in a committed `.env` or CI log.
- [ ] `.env` set: `ROBINHOOD_MAINNET_RPC`, `DEPLOYER_PRIVATE_KEY`, `SAFE_ADDRESS`,
      independently verified `EXPECTED_SAFE_SINGLETON` and `EXPECTED_SAFE_CODEHASH`,
      `TIMELOCK_MIN_DELAY=172800` (48h), `INITIAL_DEPOSIT_CAP=0` for
      the very first open (you raise it at Gate C/D), `ORACLE_KEEPER_ADDRESS`,
      `REBALANCE_KEEPER_ADDRESS`, `ALERT_WEBHOOK_URL`.
- [ ] `forge build && forge test -vvv` green on the exact commit you will deploy.
      Record the commit hash; the external audit must cover it.

### 🚦 GATE A — operator go to broadcast the deploy

Confirm: correct chain, correct Safe, cap starts at zero, keeper addresses correct,
commit hash matches the externally audited one. On your **go**:

## 3. Deploy

```bash
forge script script/Deploy.s.sol \
  --rpc-url "$ROBINHOOD_MAINNET_RPC" --broadcast --verify -vvv
```

`Deploy.s.sol` (with `SAFE_ADDRESS` set) will, as the deployer:
1. deploy `PriceOracle`, allowlist the oracle keeper;
2. deploy `IndexVault` (asset USDG, canonical router), allowlist the rebalance
   keeper, set the equal-weight-five basket;
3. set the **guardian = Safe**;
4. deploy `TimelockController(48h, proposers=[Safe], executors=[Safe],
   admin=0)`;
5. `transferOwnership(timelock)` on **both** contracts — **pending**, not yet
   effective (Ownable2Step). The deployer remains owner until the Safe accepts.

Record from the console: `PriceOracle`, `IndexVault`, `TimelockController`.

### Verify before touching ownership
```bash
cast call $VAULT  "owner()(address)"        --rpc-url $RPC   # == deployer
cast call $VAULT  "pendingOwner()(address)" --rpc-url $RPC   # == timelock
cast call $VAULT  "guardian()(address)"     --rpc-url $RPC   # == Safe
cast call $VAULT  "basketLength()(uint256)" --rpc-url $RPC   # == 5
cast call $ORACLE "pendingOwner()(address)" --rpc-url $RPC   # == timelock
cast call $VAULT  "maxPermissionlessNotional()(uint256)" --rpc-url $RPC  # == 0 (disabled)
cast call $VAULT  "weightMode()(uint8)"     --rpc-url $RPC   # == 0 (STATIC)
```
All must match. If any differs, **abort** and investigate — the deployer still
owns everything, so nothing is locked in yet.

## 4. Guardian-pause smoke test — do this BEFORE the handover

> **Why now:** `pause()` is instant (guardian = Safe), but `unpause()` is
> `onlyOwner`. **After** the handover, owner = timelock, so unpausing takes a
> full 48h timelocked proposal. While the **deployer** is still owner, unpause is
> instant — so test the pause/unpause loop here, cheaply.

1. From the **Safe**, execute `vault.pause()`. Confirm `paused() == true`.
2. Confirm `deposit` reverts, and that `redeem`/`redeemInKind` are **not**
   blocked (there are no funds yet, but the calls should not revert on a pause
   guard).
3. Confirm the **guardian cannot unpause**: a `vault.unpause()` from the Safe
   reverts (`OwnableUnauthorizedAccount`).
4. From the **deployer**, `vault.unpause()`. Confirm `paused() == false`.

If pause is not instant from the Safe, or unpause from the deployer fails, **stop
and fix before handover** — after handover this becomes a 48h round-trip.

### 🚦 GATE B — operator go to hand ownership to the timelock

## 5. Ownership handover (Safe → timelock, via timelock)

Ownership only moves when the **timelock** (the pending owner) calls
`acceptOwnership()`. The Safe drives that through the timelock: schedule, wait
48h, execute — for **each** contract. Payload is `acceptOwnership()`:

```bash
DATA=$(cast calldata "acceptOwnership()")     # 0x79ba5097
SALT=$(cast keccak "mag7-canary-accept-v1")   # any unique bytes32
```

For the **vault** (repeat identically for the **oracle**), the Safe submits to
the timelock:
```
schedule(target=$VAULT, value=0, data=$DATA, predecessor=0x0, salt=$SALT, delay=172800)
# …wait ≥ 48h…
execute (target=$VAULT, value=0, payload=$DATA, predecessor=0x0, salt=$SALT)
```
(Use the Safe Transaction Builder against the `TimelockController` address, or
`cast send` from each signer via the Safe. Batch the two `schedule` calls, wait,
then the two `execute` calls.)

Verify after executing both:
```bash
cast call $VAULT  "owner()(address)"        --rpc-url $RPC   # == timelock
cast call $VAULT  "pendingOwner()(address)" --rpc-url $RPC   # == 0x0
cast call $ORACLE "owner()(address)"        --rpc-url $RPC   # == timelock
```

**Retire the deployer key now.** It has no ownership role anymore; do not keep it
warm.

## 6. Stand up the keeper

- Wire keeper `.env`: `INDEX_VAULT_ADDRESS`, `PRICE_ORACLE_ADDRESS`,
  `BASKET_SYMBOLS=NVDA,AAPL,GOOGL,AMD,NFLX`, slippage/impact/tolerance defaults,
  `ALERT_WEBHOOK_URL`, signer config.
- **Prices:** schedule `npm run post-prices` on a cadence well under
  `maxStaleness` (default 1h) — e.g. every 10–15 min. Each run does a
  `staticCall` pre-flight and alerts on failure.
- **Health:** schedule `npm run health` every few minutes. It exits non-zero and
  alerts (`error`) on stale prices, an unhealthy buffer, or an unreachable API.
- Confirm the first `post-prices` lands (`cast call $ORACLE "prices(address)"` for
  each token shows a recent `updatedAt` and a non-zero price) and the first
  `health` prints `ok: true`. Confirm a test alert reaches your channel.
- Do **not** run `rebalance --execute` yet — there are no deposits to allocate.

### 🚦 GATE C — operator go to open deposits

Only after: handover verified, keeper posting fresh prices, health green,
alerting confirmed.

## 7. Open deposits at a tiny cap

Deposit cap changes are `onlyOwner` → a **timelock proposal** from the Safe:
```
schedule/execute → vault.setDepositCap(<tiny cap, e.g. 1000e6 = 1,000 USDG>)
```
Then, as the very first depositor, **you** deposit a small amount and:
- confirm shares mint at NAV (`convertToShares`), `totalAssets` updates;
- run one keeper `rebalance` (dry-run, review every leg, then `-- --execute`);
- confirm the 20% idle buffer holds post-rebalance (`health` stays green);
- do a small **standard redeem** and a small **`redeemInKind`**, confirming both
  return the expected assets. `redeemInKind` must return every basket token
  pro-rata and must work regardless of price freshness.

## 8. Soak, then stage up

Hold at each cap for a defined soak window (suggest ≥1–2 weeks) watching:
- prices always fresh within `maxStaleness`; health never red;
- NAV tracks the basket; idle buffer re-established after every rebalance;
- no unexpected reverts; alerts only for real conditions.

### 🚦 GATE D — per cap raise
Each raise is its own `setDepositCap` timelock proposal, only after the current
cap's soak criteria are met. Raise in stages (e.g. 1k → 10k → 50k → …), never
jump straight to a large cap.

### 🚦 GATE E — enabling v2 features (later, separately)
- **Permissionless rebalance:** validate the drift/slippage/notional numbers,
  then `setRebalancePolicy(interval, driftBps, slippageBps, maxNotional)` via
  timelock with a **small** `maxNotional` first. Recall the loss bound is
  per-window `slippage × notional-to-target` (see
  [audit/threat-model.md](./audit/threat-model.md) T5) — start tiny.
- **MARKET_CAP weighting:** first get `post-market-caps` posting a clean feed,
  confirm `getMarketCap` is fresh for every name, then `setWeightMode(MARKET_CAP)`
  via timelock. `maxWeightBps` (30%) bounds concentration. STATIC stays the safe
  fallback.

## 9. Rollback / incident response

Ordered by reversibility — start at the top:

1. **Pause (instant, from the Safe/guardian):** `vault.pause()`. Stops deposits
   and both rebalance paths immediately. **Exits stay open:** `redeem` (within
   idle USDG) and `redeemInKind` (always) keep working — pausing never traps
   funds. ⚠️ Unpausing is `onlyOwner` = a 48h timelock proposal, so treat a pause
   as a ≥48h commitment.
2. **In-kind exit (any holder, no keeper, no oracle):** if the keeper is down or
   prices are unusable, holders call `redeemInKind` for pro-rata USDG + basket
   tokens. This is the ultimate escape hatch and needs nothing but the vault.
3. **Revoke any compromised keeper before unpausing:** schedule a timelock batch
   that calls `setKeeper(compromised, false)` before `unpause()`, then add the
   replacement keeper separately or later in that batch. Never unpause while a
   known-compromised keeper remains authorized.
4. **Restore liquidity only after clearing the incident cause:**
   `restoreLiquidity` deliberately stops while paused so a compromised keeper or
   router cannot make new vault calls. Router allowances are cleared after every
   successful swap, but if router compromise is suspected, verify allowances are
   zero and prefer an in-kind wind-down rather than unpausing. If standard USDG exits must be restored,
   first rule out those causes, then schedule the timelocked unpause and run
   `npm run rebalance -- --restore-liquidity --execute`. Until then, use the
   in-kind exit above; do not expect restore to work during pause.
5. **Governance change / wind-down:** any config or ownership move is a timelock
   proposal — publicly visible for 48h before it can execute.

## 10. What Claude does and does not do here

Claude can: read on-chain state with you, sanity-check calldata and gate
criteria, draft the Safe transactions, and interpret keeper/health output.
Claude will not: create the Safe, hold or generate mainnet keys, broadcast any
mainnet transaction, or advance a gate on your behalf. Every 🚦 is yours.
