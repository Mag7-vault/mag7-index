# Mainnet zero-cap deployment — 2026-09-05

This record covers the Gate A deployment of MAG7 to Robinhood Chain mainnet
(`chainId 4663`). The deployment is dormant: the deposit cap is zero and no
customer deposits are accepted.

## Release identity

- Frozen code candidate: `e1c7d91fd8dfa7818ef639c77aa3809903a54dc5`
- Deployment script: `script/Deploy.s.sol:Deploy`
- Compiler: Solidity `0.8.26`
- Initial deployment block: `55387046`

## Contracts

- PriceOracle: `0x117C44F8Ed3E57490c14B475ba086c58A2335778`
- IndexVault: `0xaAF58BD0Dfe5aD5514f421C02959ef44D2fB0ca8`
- TimelockController: `0xBC8A2ac01AeEb849A15825e9FA12ebFBe83Dd8d8`
- Governance Safe / guardian: `0x5A205159348BBe6c4A5a264B59fC8Df7A4ab6a39`
- Canonical USDG: `0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168`

## Confirmed configuration

- Deposit cap: `0` USDG
- Timelock delay: `172800` seconds (48 hours)
- Safe is the timelock's proposer and executor.
- Deployer is not a timelock administrator.
- Vault guardian is the Safe.
- Oracle and rebalance keepers are distinct from the deployer and Safe.
- Basket: NVDA, AAPL, GOOGL, QQQ, NFLX at 2,000 bps each.
- Vault and oracle ownership are pending to the timelock. The deployer remains
  owner until the Safe schedules and executes both `acceptOwnership()` calls.

## Deployment transactions

All nine receipts returned status `1`:

- PriceOracle create: `0xc439a8d1688f07736f0fa3148d863f4c8dbc33a7ebe6990019796347be9d7e8e`
- Oracle keeper: `0x49a71ad02fce5eb8df1a2741c9616278e1af448cdbe6da1ed28f126728290388`
- IndexVault create: `0xb26601a747206fd26853e2df4ad42ba476640b45335890568d23734a1f4ff07a`
- Rebalance keeper: `0x5c728572869d2140d86af3503c0cb2c4e5e289104c7b59c9c033dcb94f2fa183`
- Basket configuration: `0xb5dda61b6f59d31dc43fbd9e315b6065e1948c995d59c912c32c2825930cc845`
- Guardian configuration: `0x39c72a07a658220910d92e6a17ae84c9d384b23f745cf97127ec7b2aac75f418`
- TimelockController create: `0xd209297eda82464c6dd745f0446d49d205be98206297f6c0514906ca391cb132`
- Oracle ownership initiated: `0xbba4745ec494ea26de0a1c64043a2fbd3eb885456c605073f5eab40eac51eb7b`
- Vault ownership initiated: `0x306696eac075b26d4d6a3aec033aca789e4ad78df692c7ea4bdce4702afd4c13`

## Guardian pause smoke test — 2026-09-06

- Safe `pause()` execution: `0x73e9bace87664ed8d8ca0a1bfee27743bfb6be5ffb46ed9ebe1d725f56bb9f5a`
  (status `1`, caller = Safe, vault emitted `Paused`).
- While paused, live reads returned `paused() == true`, `depositCap() == 0`,
  and `maxDeposit(...) == 0`.
- Deployer `unpause()` execution: `0x445475aa5da739c2f3ec8c0f6c74d5cd8466432d3c8668ad724c4055b316bed2`
  (status `1`, block `55496519`, vault emitted `Unpaused`).
- Final live reads returned `paused() == false`, `depositCap() == 0`, and
  `maxDeposit(...) == 0`. The vault is operational but remains closed to
  deposits.

## Timelock ownership handover schedule — 2026-09-06

The Safe executed both `schedule(...)` calls in transaction
`0x25d9c080d75c788fe0cef49ff3dd05bd6a2513e4e790baf245170a1a32b04470`
(block `55511374`). Both operations use a 172,800-second delay and become
executable at Unix timestamp `1788823497`: **2026-09-08 00:24:57 WAT**
(`2026-09-07 23:24:57 UTC`).

- Oracle operation ID:
  `0x5a2d9c0afc48d9ca34ee60ea2a1ae6c9771fd55357ffd5a148c24c02300892d6`
- Vault operation ID:
  `0xf64b12f9d3b9af248f10de5ba6ab044e3f72cf14e1a1019c48f09e34ae1b4f26`

Live reads after scheduling returned `isOperationPending(...) == true` for
both IDs. Execution must use the exact targets, payloads, predecessors, and
salts recorded by these operations. Do not execute before the ready timestamp.

## Keeper activation and deployer recovery — 2026-09-06

- Deployer funded the oracle keeper with `0.006 ETH`:
  `0xd729cde1ebd8776dd4b2377a2aad48805d5970563a2d0d625093f44c986a7f38`.
- Deployer returned `0.009 ETH` to the operator wallet:
  `0x0c5b44c271576e8920cd97e1739d3d024dc85295054354e21bac5b6295c2180f`.
- Remaining deployer balance after both transfers was approximately
  `0.001079 ETH`; retain it until ownership handover completes.
- Oracle keeper posted the first five live prices:
  `0xa2be228702f7fd8e6c933bd7ffba023d0216cba897e864775bac2ebbbedffa26`
  (status `1`, block `55523047`).
- The immediate post-transaction health check returned `ok: true`: all five
  prices were fresh, all five v3 route round trips were executable, the vault
  was unpaused, and the deposit cap remained zero.
- A temporary local scheduled task, `MAG7 Oracle Prices`, runs price posting
  plus health verification every 30 minutes through 2026-09-07 17:00 WAT.
  Its authenticated Alchemy Robinhood Chain mainnet RPC was verified against
  chain ID `4663` on 2026-09-06. The task reads that endpoint from the ignored
  repository `.env`; this task is deadline support, not durable production
  hosting.

## Explicit operator waivers and remaining gates

The operator explicitly waived independent external-audit approval and webhook
alerting before Gate A. Those waivers do not make the deployment independently
audited or production-monitored.

Blockscout source publication was attempted using Robinhood's documented
Foundry flow, but its API returned a Cloudflare browser challenge. Public source
verification remains pending and must be completed before deposits are opened.

Next: verify source on Blockscout, wait until the recorded ready timestamp, and
execute both ownership acceptances through the Safe. Do not raise the deposit
cap before those gates pass.
