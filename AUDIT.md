# Auditing this repository

This is an **unaudited pre-production** ERC-4626 index vault. If you are here to
perform a security audit:

## Start here

**[docs/audit/handoff.md](docs/audit/handoff.md)** — it pins the scope,
build/reproduce steps, the trust model, and where to focus. The rest of the
package is in [docs/audit/](docs/audit/).

## Which commit

Clone the repo and check out the tip of branch `feat/launch-hardening-v2` — it
has the in-scope code **and** the full audit package.

The in-scope Solidity (`src/`, `script/`) is the code as of commit `482c1bc` and
has not changed since; the later commits only add these audit documents. Confirm
for yourself:

    git diff 482c1bc HEAD -- src script     # expect: no output

Reference `482c1bc` for code locations in your findings.

## Scope, in one line

In scope: `src/IndexVault.sol`, `src/PriceOracle.sol`, `script/Deploy.s.sol`.
Out of scope: the external Voxelithic contracts, the tokenized-equity ERC-20s,
vendored OpenZeppelin (unmodified), and the off-chain `keeper/`. Full detail in
the handoff packet.

## Build & test

    forge build && forge test -vvv          # 55 passing (Foundry, solc 0.8.26)
    cd keeper && npm ci && npm test         # 21 passing (Node >= 20)
