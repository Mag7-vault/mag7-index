# Production Safe verification and signer rehearsal — 2026-09-05

This record covers the MAG7 governance Safe on Robinhood Chain mainnet
(`chainId 4663`). It does not authorize or record a MAG7 protocol deployment.

## Verified Safe

- Safe: `0x5A205159348BBe6c4A5a264B59fC8Df7A4ab6a39`
- Safe version: `1.4.1`
- Threshold: `2 of 3`
- Owners:
  - `0xa5e7d6C189b37D9293908E0A28Da4D65d65a7f7A`
  - `0x26032745BcB969B95B4610A9a48D33Bd4340812D`
  - `0x8cA71B70C91BD8250073dfDD323b9219Bce6A165`
- SafeL2 singleton: `0x29fcB43b46531BcA003ddC8FCB67FFE91900C762`
- Singleton runtime code hash:
  `0xb1f926978a0f44a2c0ec8fe822418ae969bd8c3f18d61e5103100339894f81ff`
- Safe proxy runtime code hash (the `EXPECTED_SAFE_CODEHASH` deployment input):
  `0xd7d408ebcd99b2b70be43e20253d6d92a8ea8fab29bd3be7f55b10032331fb4c`
- SafeProxyFactory: `0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67`
- CompatibilityFallbackHandler: `0xfd0732Dc9E303f09fCEf3a7388Ad10A83459Ec99`
- Enabled modules: none
- Guard: none
- The funded creator/executor address is not a Safe owner.

The singleton, factory, and fallback-handler addresses and runtime code hashes
matched Safe's published v1.4.1 deployment artifacts. The proxy creation record
also identifies the canonical factory above.

## Independent signer rehearsal

Owner 1 proposed and signed a zero-value call from the Safe to itself. Owner 2
independently supplied the second signature. The non-owner creator/executor paid
gas and executed the fully signed transaction.

- Call: `changeThreshold(2)`
- Value: `0 ETH`
- Safe nonce: `0` before, `1` after
- Threshold: remained `2 of 3`
- Execution transaction:
  `0xc314cc2aa7eebf683221ea98fb5bf2f332bd06baad800b9e886d1808eb3fb4b6`
- Receipt status: success
- Block: `55120772`
- Gas used: `86,936`

Post-execution reads confirmed the same three owners and threshold. This proves
that two independently controlled owners can authorize a Safe transaction and
that a separate funded executor can submit it. It does not prove hardware-wallet
custody, backup quality, organizational independence, or incident-response
readiness; those remain operator responsibilities.

## Deployment inputs

The local ignored `.env` records these public values:

```dotenv
SAFE_ADDRESS=0x5A205159348BBe6c4A5a264B59fC8Df7A4ab6a39
EXPECTED_SAFE_SINGLETON=0x29fcB43b46531BcA003ddC8FCB67FFE91900C762
EXPECTED_SAFE_CODEHASH=0xd7d408ebcd99b2b70be43e20253d6d92a8ea8fab29bd3be7f55b10032331fb4c
```

Mainnet remains approval-gated. The external audit, archive-capable keeper fork
execution, keeper production setup, deployment verification, and zero-cap canary
gates are not satisfied by this rehearsal.
