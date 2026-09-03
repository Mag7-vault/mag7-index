# Keeper operations

The keeper targets canonical Voxelithic contracts on Robinhood Chain mainnet
(`4663`). It fetches a fresh route before every action, validates canonical
token metadata, rejects price impact above the configured limit, and refuses
v4 routes because `IndexVault` v1 accepts only v3 `Hop[]` calldata.

## Commands

```bash
npm ci
npm test
npm run health
npm run post-prices
npm run rebalance                         # dry run
npm run rebalance -- --execute            # reviewed allocation transaction
RESTORE_USDG_AMOUNT=500 npm run rebalance -- --restore-liquidity
RESTORE_USDG_AMOUNT=500 npm run rebalance -- --restore-liquidity --execute
```

Schedule `post-prices` every 15 minutes, `health` every 5 minutes, and the
rebalance dry run daily. Allocation-changing execution should remain a weekly,
reviewed operation until the system has independent audit history. Run a
liquidity restore when an exit request exceeds idle USDG.

## Keys and alerts

- Keep the owner/deployer key offline or behind a Safe/timelock.
- Give the oracle updater and rebalance executor different keys. Neither key
  should be an owner; revoke either independently with `setKeeper`.
- Store runtime keys in a secret manager, never a checked-in `.env` or CI log.
- Alert immediately on health exit `1` (RPC/API/config failure) or `2` (stale
  prices or buffer below 20%). Stop execution on chain-ID, token, router, v4,
  price-impact, slippage, or simulation failures.
- Fund keeper EOAs only with the gas needed for a short operating window.

The committed `routes.snapshot.json` is discovery evidence, not execution
configuration. Routes and minimum outputs are always refreshed at run time.
