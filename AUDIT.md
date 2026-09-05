# Security review

This is an **unaudited pre-production** ERC-4626 index vault. The security
documentation lives in [docs/audit/](docs/audit/).

The current external-review candidate is pinned at
`e1c7d91fd8dfa7818ef639c77aa3809903a54dc5`. Older hashes in the remediation
record are historical context, not substitutes for reviewing the final code.

## Review package

**[docs/audit/handoff.md](docs/audit/handoff.md)** — start here for the pinned
scope, build instructions, trust model, and review focus. The rest of the
package is in [docs/audit/](docs/audit/). This package prepares an independent
external audit; it is not itself an audit.

## Scope, in one line

In scope: `src/IndexVault.sol`, `src/PriceOracle.sol`, `script/Deploy.s.sol`.
Out of scope: the external Voxelithic contracts, the tokenized-equity ERC-20s,
vendored OpenZeppelin (unmodified), and the off-chain `keeper/`. Full detail in
the review package.

## Build & test

    forge build && forge test -vvv          # 65 passing (Foundry, solc 0.8.26)
    cd keeper && npm ci && npm test         # 22 passing (Node >= 20)
