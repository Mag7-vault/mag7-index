# Keeper operations

The keeper targets canonical Voxelithic contracts on Robinhood Chain mainnet
(`4663`). It fetches a fresh route before every action, validates canonical
token metadata, rejects price impact above the configured limit, and refuses
v4 routes because `IndexVault` accepts only v3 `Hop[]` calldata.

## Commands

```bash
npm ci
npm test
npm run health
npm run post-prices
npm run post-market-caps                  # dry run (MARKET_CAP mode only)
npm run post-market-caps -- --execute     # post market caps on-chain
npm run rebalance                         # dry run
npm run rebalance -- --execute            # reviewed allocation transaction
RESTORE_USDG_AMOUNT=500 npm run rebalance -- --restore-liquidity
RESTORE_USDG_AMOUNT=500 npm run rebalance -- --restore-liquidity --execute
```

Schedule `post-prices` every 15 minutes, `health` every 5 minutes, and the
rebalance dry run daily. Allocation-changing execution should remain a weekly,
reviewed operation until the system has sufficient operational history. Run a
liquidity restore when an exit request exceeds idle USDG. In `MARKET_CAP`
weighting mode, schedule `post-market-caps --execute` (daily is ample — caps
move slowly and carry a looser staleness window than prices).

`health` validates fresh oracle prices, the USDG buffer, and executable v3
routes in both directions for every basket token. A v4-only or unavailable leg
makes the report red even when NAV and the buffer are otherwise healthy.

The keeper reads `vault.targetWeight(token)`, the resolved target under whichever
weighting mode is active, so nothing here changes between `STATIC` and
`MARKET_CAP` mode.

## Keys and alerts

- Keep the owner/deployer key offline or behind the Safe/timelock.
- Give the oracle updater and rebalance executor different keys. Neither key
  should be an owner; revoke either independently with `setKeeper`.
- Store runtime keys in a secret manager, never a checked-in `.env` or CI log.
  Better still, set `KEEPER_SIGNER_KIND=module` and sign from a KMS/HSM so the
  raw key never touches the keeper host — see `signers/aws-kms.example.mjs`.
- Set `ALERT_WEBHOOK_URL` (Slack or Discord) so `health`, `post-prices`,
  `post-market-caps`, and `rebalance --execute` page you on failure. Alerting is
  non-fatal: a broken webhook logs and is skipped, it never aborts an operation.
- Alert immediately on health exit `1` (RPC/API/config failure) or `2` (stale
  prices or buffer below 20%). Stop execution on chain-ID, token, router, v4,
  price-impact, slippage, or simulation failures.
- Fund keeper EOAs only with the gas needed for a short operating window.

## Managed signer (KMS/HSM)

`signer.mjs` resolves a signer per role (`oracle`, `rebalance`). The default
`raw` kind reads `ORACLE_KEEPER_PRIVATE_KEY` / `REBALANCE_KEEPER_PRIVATE_KEY`.
For a managed signer, point `KEEPER_SIGNER_MODULE` at a file exporting
`createSigner(provider, role)` that returns any ethers-compatible `Signer`
(e.g. an AWS KMS signer). The address it derives is what you allowlist with
`setKeeper` — the vault never learns the key is externally held.

## Market-cap feed

`post-market-caps.mjs` feeds `IndexVault`'s optional `MARKET_CAP` mode. Values
are an abstract, self-consistent unit — only ratios matter, since the vault
normalizes them into capped weights. Provider is pluggable
(`MARKETCAP_PROVIDER`): `static`/`equal` (equal weights, the safe default),
`http` (a REST source), or `module` (your own adapter). On a source failure the
fetch falls back to the last-known snapshot, then to equal weights, and alerts —
so a data outage degrades gracefully instead of blocking rebalances.

## Permissionless rebalance

`rebalancePublic` lets anyone nudge the vault toward target when a rebalance is
*due*, bounded entirely on-chain by the oracle (direction, no-overshoot, an
oracle-implied `minOut` floor, and a notional cap). It ships **disabled** (zero
notional) and is enabled by the owner via `setRebalancePolicy` through the
timelock. The keeper does not call it; it is a public safety valve, and the
trusted `rebalance` path remains available for larger reviewed moves.

The committed `routes.snapshot.json` is discovery evidence, not execution
configuration. Routes and minimum outputs are always refreshed at run time.
Swap deadlines are derived from the latest chain block, not the host clock.
When a batch simulation fails, the keeper also simulates each leg separately
and reports the failing token pair before it refuses to broadcast.
