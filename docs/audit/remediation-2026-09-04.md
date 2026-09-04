# Audit remediation — 2026-09-04

Baseline reviewed: `482c1bc` (the Solidity under `src/` and `script/` was
unchanged at audit handoff tip `d323211`). Remediation lives on
`fix/audit-remediation-2026-09-04`.

## Closed findings

- **Mainnet role/governance defaults:** deployment now fails closed unless the
  cap is zero, the timelock is at least 48 hours, deployer and keeper roles are
  separated, and the Safe proxy code hash, singleton, owners, and threshold
  match explicit production expectations.
- **Permissionless interval griefing:** empty arrays and zero-amount legs revert
  before `lastRebalanceAt` can advance.
- **Paused recovery procedure:** the runbook now uses in-kind exits while
  paused and requires a compromised keeper to be revoked before unpause.
- **Residual router approvals:** every router swap clears any unspent ERC-20
  allowance before the vault call completes.

## Verification

- `forge fmt --check`
- `forge build`
- `forge test -vvv`
- `keeper`: `npm test`

Mainnet deployment remains operator-gated. The expected Safe proxy code hash
and singleton must come from an independently approved Safe deployment, not
from trusting the candidate address itself.
