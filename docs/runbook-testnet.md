# Runbook — Funded Testnet Demo

> **Who runs this:** you (the operator). This document is a script to follow; it
> does not move mainnet funds. Every command is run from your machine with your
> keys and RPC. Claude prepared this runbook but does **not** execute it.
>
> **Status of the code:** unaudited pre-production. This demo is a rehearsal, not
> a launch. Do it *before* the external audit sign-off if you want an early
> operational shakedown, but real money only follows audit + the canary
> ([runbook-canary.md](./runbook-canary.md)).

## 0. What this proves — and what it does not

The Robinhood **testnet** (chain `46630`) does **not** host Voxelithic's router,
quoter, or tokenized equities. So the testnet demo can't trade real pools. It
uses [`script/DeployTestnetDemo.s.sol`](../script/DeployTestnetDemo.s.sol), which
deploys its **own** demo USDG, five demo tokens, and a deterministic
`TestnetDemoRouter`, then runs a full deposit → price → rebalance in one script.

| Validated on live testnet | Validated on a mainnet **fork** (§5) | First real at canary |
|---|---|---|
| Deploy, basket wiring, NAV math | Keeper vs. **live Voxelithic** quotes | Real Voxelithic liquidity |
| Deposit / redeem / redeemInKind | `Deploy.s.sol` governance handover | Real Safe + timelock |
| Guardian pause / unpause | Timelock `acceptOwnership` flow | Real depositor funds |
| Permissionless `rebalancePublic` | `post-prices` / `rebalance` scripts | Real keeper cron uptime |
| Alerting webhook (§4) | `health.mjs` red/green | — |

The keeper `.mjs` scripts are pinned to mainnet chain `4663` (a hard chain-id
guard) and call the real Voxelithic API for quotes, so they **cannot** run
against testnet `46630`. Rehearse them on a mainnet fork (§5). Don't edit the
chain guards to force them onto testnet.

## 1. Pre-flight checklist

- [ ] `forge fmt --check && forge build && forge test -vvv` all green locally.
- [ ] `cd keeper && npm ci && npm test` green (21 tests).
- [ ] **Three distinct keys**, none reused as another's role, none holding
      mainnet value: `DEPLOYER_PRIVATE_KEY`, `ORACLE_KEEPER_PRIVATE_KEY`,
      `REBALANCE_KEEPER_PRIVATE_KEY`. The deployer key is throwaway for testnet.
- [ ] Deployer address funded with testnet gas.
- [ ] `.env` created from [`.env.example`](../.env.example):
      `ROBINHOOD_TESTNET_RPC`, `DEPLOYER_PRIVATE_KEY`, `TESTNET_DEPOSIT_CAP`
      (default 1,000 demo USDG). Keeper keys not needed for §2–§3 (the demo
      script signs as deployer).
- [ ] `.env` is git-ignored and never pasted into a shell history you keep.
      Secrets live in your secret manager, not a committed file or CI log.

## 2. Deploy the demo

```bash
# chain 46630 (or 31337 for a pure-local anvil dry run first)
forge script script/DeployTestnetDemo.s.sol \
  --rpc-url "$ROBINHOOD_TESTNET_RPC" --broadcast -vvv
```

Record from the console output:
- `PriceOracle:` → `PRICE_ORACLE_ADDRESS`
- `IndexVault:` → `INDEX_VAULT_ADDRESS`
- `Demo USDG:` → the demo asset address
- `Vault NAV:` should be ~`10000000` (10 demo USDG, 6-dec) and `Idle USDG:`
  ~`2000000` (the 20% buffer) after the in-script rebalance.

**Expected:** NAV ≈ deposited amount; idle ≈ 20% of NAV. If NAV is 0 or idle is
below 20%, **abort** — the buffer invariant or pricing is wrong; re-check before
going further.

## 3. Exercise the lifecycle (cast)

Set `V=$INDEX_VAULT_ADDRESS`, `O=$PRICE_ORACLE_ADDRESS`, `U=<demo USDG>`. Use the
deployer key for all sends (it owns the demo). Read helpers:

```bash
cast call $V "totalAssets()(uint256)"        --rpc-url "$ROBINHOOD_TESTNET_RPC"
cast call $V "maxWithdraw(address)(uint256)" $(cast wallet address $DEPLOYER_PRIVATE_KEY) --rpc-url "$ROBINHOOD_TESTNET_RPC"
cast call $V "isRebalanceDue()(bool)"        --rpc-url "$ROBINHOOD_TESTNET_RPC"
```

Walk each path and confirm the expected result:

1. **Deposit more** — approve then `deposit(assets,receiver)`; shares mint at NAV.
2. **Standard redeem** — `redeem(shares,receiver,owner)` up to `maxRedeem`
   (capped to the idle USDG buffer). Confirm USDG returns and shares burn.
3. **In-kind redeem** — `redeemInKind(shares,receiver,owner)`; confirm you
   receive pro-rata demo USDG **and** each demo token. This must work even after
   step 6 pauses the vault.
4. **Permissionless rebalance** — enable it, then call from a **non-keeper**:
   ```bash
   # owner enables: 6d interval, 500bps drift, 100bps slippage floor, 500 USDG notional
   cast send $V "setRebalancePolicy(uint256,uint256,uint256,uint256)" 518400 500 100 500000000 \
     --private-key $DEPLOYER_PRIVATE_KEY --rpc-url "$ROBINHOOD_TESTNET_RPC"
   ```
   Then, from an address that is **not** a keeper and **not** the owner, submit a
   `rebalancePublic(legs)` whose `minOut` clears the oracle floor. Confirm it
   succeeds, and that a leg with `minOut` below the floor, the wrong direction,
   or while not due **reverts**. (The unit suite proves these on-chain; here you
   confirm it on a live chain with a real third-party sender.)
5. **NAV fail-closed** — warp isn't available on a live chain; instead lower
   `setMaxStaleness` to a few seconds via the owner, wait past it, and confirm
   `totalAssets()` / `deposit` revert while `redeemInKind` still works. Restore
   staleness afterward.
6. **Guardian pause** — `setGuardian(<guardian addr>)`, pause **from the
   guardian**, confirm `deposit` reverts and `redeem`/`redeemInKind` still work,
   confirm the guardian **cannot** `unpause`, then `unpause` from the owner.

## 4. Alerting smoke test

Alerting is transport-only (a webhook POST) and is chain-independent, so test it
directly without the mainnet guard:

```bash
cd keeper
ALERT_WEBHOOK_URL="<your Slack/Discord webhook>" node -e \
 "import('./notify.mjs').then(m=>m.sendAlert('warn','Testnet demo alert',{vault:process.env.INDEX_VAULT_ADDRESS||'demo'}).then(r=>console.log(r)))"
```

**Expected:** a message appears in the channel and the call prints
`{ delivered: true, kind: 'slack'|'discord' }`. Confirm an **unset** URL prints
`{ delivered: false, reason: 'no-webhook' }` and does **not** throw — alerting is
non-fatal by design.

## 5. Mainnet-fork rehearsal (governance + keeper)

This is where the keeper scripts and the Safe/timelock handover are actually
exercised, because a fork has both canonical Voxelithic **and** accounts you
control.

```bash
# Fork mainnet locally; keeper scripts see chain 4663 and real Voxelithic.
anvil --fork-url "$ROBINHOOD_MAINNET_RPC" --chain-id 4663 &
```

- **Governance:** run `Deploy.s.sol` against the fork with a test `SAFE_ADDRESS`
  (an anvil account). Confirm it deploys the `TimelockController`, sets the
  guardian, and leaves ownership **pending** to the timelock. Then rehearse the
  handover exactly as [runbook-canary.md §3](./runbook-canary.md) describes:
  schedule + (after delay) execute `acceptOwnership()` on both contracts through
  the timelock. On the fork you can `evm_increaseTime` past the 48h delay.
- **Keeper:** point the keeper `.env` at the fork RPC and the deployed addresses,
  then `npm run post-prices`, `npm run rebalance` (dry-run first, then
  `-- --execute`), and `npm run health`. Confirm `health` prints `ok: true`,
  quotes come back from Voxelithic, and `rebalance` respects the tolerance band.
- Confirm the `staticCall` pre-flight in each script catches a bad leg before it
  would broadcast.

## 6. Abort criteria (stop and investigate)

- NAV is zero, negative-looking, or idle USDG < 20% after any rebalance.
- Any lifecycle step in §3 reverts where it should succeed, or succeeds where it
  should revert (especially a permissionless leg below the oracle floor).
- `redeemInKind` does **not** return every basket token pro-rata, or fails while
  paused.
- On the fork: `health.mjs` prints `ok: false`, a keeper `staticCall` passes but
  the broadcast reverts, or quotes exceed `MAX_PRICE_IMPACT_BPS`.
- Alert webhook throws (rather than returning `delivered:false`) — that would
  mean an alerting bug could crash the keeper.

## 7. Teardown

Testnet contracts can be abandoned (no value). Rotate or discard the testnet
deployer key. Kill the anvil fork. Nothing from this demo carries to mainnet
except your confidence and notes — record any surprises against the canary
runbook's gates before proceeding.
