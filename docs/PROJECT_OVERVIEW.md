# MAG7 Index Vault — Project Overview

## What the project is

MAG7 Index Vault is an on-chain index vault being built on Robinhood Chain. It
allows a user to deposit USDG and receive vault shares representing a
proportional interest in a basket of tokenized US equity exposures.

Instead of buying and managing every asset separately, the user holds one
ERC-4626 vault share while the system handles allocation and rebalancing.

## Current basket

The first version uses five equally weighted tokenized market assets:

- NVIDIA (NVDA)
- Apple (AAPL)
- Alphabet (GOOGL)
- Invesco QQQ ETF (QQQ)
- Netflix (NFLX)

Microsoft is not in the integrated token list, and Meta, Tesla, and Amazon
currently route only through Voxelithic v4 pools that this version does not yet
execute. QQQ replaces the previous AMD sleeve because QQQ currently has a live
v3 USDG route. QQQ is an ETF exposure rather than a single company and contains
some of the other basket names, so the economic exposure is not five independent
single-stock positions. Broader "Magnificent Seven" coverage can be added once
v4 routing lands.

## How it works

1. A user deposits USDG into the vault.
2. The vault issues ERC-4626 shares to the user.
3. A price keeper obtains current quotes from Voxelithic and posts them to the
   on-chain price oracle.
4. A separate rebalance keeper trades through Voxelithic to allocate the vault
   across the basket.
5. The user can later redeem vault shares for available USDG.

The vault keeps at least 20% of its value in idle USDG after rebalancing. If a
redemption is larger than the available USDG, the keeper must first sell basket
assets back into USDG. Users also have an in-kind exit that returns their
proportional USDG and basket tokens directly without requiring current oracle
prices.

## Main components

- **IndexVault:** accepts deposits, issues shares, accounts for portfolio value,
  manages redemptions, and executes approved rebalances.
- **PriceOracle:** stores keeper-posted token prices and rejects stale data.
- **Keeper service:** retrieves prices, builds routes, posts oracle updates,
  rebalances the vault, checks system health, and sends alerts.
- **Voxelithic:** provides the external router, quoter, and pools used for
  tokenized-equity trades.
- **Safe and timelock:** control production governance and delay important
  configuration changes by at least 48 hours.

## Safety design

The current design includes:

- separate price, rebalance, and governance roles;
- a Safe multisig and 48-hour governance timelock;
- deposits closed by default at mainnet deployment;
- a 20% minimum idle-USDG reserve after rebalancing;
- checks against stale prices, excessive slippage, invalid routes, and unsafe
  basket changes;
- a guardian that can pause deposits and rebalancing during an incident;
- standard USDG redemptions that remain available while paused; and
- a price-independent in-kind emergency exit.

## Current status

The contracts, keeper service, deployment scripts, tests, runbooks, and
security-review handoff package have been built. The current automated suite passes:

- 65 Solidity tests, including invariant testing;
- 22 keeper-service tests; and
- a live Robinhood Chain fork check for configured contract addresses and token
  metadata.

The project is still **pre-production**. It has not been opened for public
deposits and has not completed an independent professional audit. The latest
route preflight confirms the QQQ replacement and the other four basket legs
currently execute bidirectionally through v3. Route health remains a mandatory
pre-deployment check because venue routing can change.

## What remains before launch

1. Independent external audit and remediation of any new findings.
2. Funded testnet and mainnet-fork operational rehearsal.
3. Creation and verification of the production Safe multisig.
4. Deployment with a zero deposit cap and ownership handover to the timelock.
5. Keeper, monitoring, and alerting verification.
6. A small mainnet canary followed by gradual cap increases after stable soak
   periods.

Voxelithic v4 routing can be added later to support assets such as Meta, Tesla,
and Amazon, but it is not required for the five-asset first release.
