# MAG7 frontend

React/Vite + TypeScript frontend implementing the selected Index Infrastructure design.

## Local preview

Run `npm ci`, then `npm run dev -- --port 4180`. The site includes Overview,
Vault, Basket, Mechanics, and nine searchable documentation articles.
`npm run build` writes the static site to `dist/client`.

## Connect a deployment

For local development, `deployment.local.json` in this directory overrides the
`/deployment.json` response only in the Vite development server. It is ignored
by Git and excluded from production builds. The current override preserves
Claude's Anvil fixture on chain 31337, port 8545. Remove or rename that override
to review the in-memory demo locally. Invalid overrides return an error, not
demo balances. Production preview does not use this override.

The agreed initial basket is NVDA, AAPL, GOOGL, QQQ, NFLX at 2000 bps each.
Live holdings and weights still come from the configured contract.

`public/deployment.json` is `null` by default: this deliberately selects the
clearly labeled in-memory demo. Replace it with a reviewed public configuration:

```json
{
  "environment": "local",
  "chainId": 31337,
  "rpcUrl": "http://127.0.0.1:8545",
  "vaultAddress": "<deployed IndexVault address>",
  "deploymentBlock": 0,
  "explorerUrl": "",
  "chainName": "Local MAG7 fixture",
  "nativeCurrency": { "name": "Ether", "symbol": "ETH", "decimals": 18 }
}
```

For mainnet set environment `mainnet`, chain ID `4663`, the verified vault
deployment block, and the reviewed chain/RPC/explorer/native-currency values.
Testnet uses its own demo deployment; never use mainnet canonical token addresses
as a substitute for a deployed testnet vault. Public configuration contains no
secrets; RPC credentials placed here would be visible to site visitors.

The vault is the source of truth for asset, router, oracle, token list, decimals,
weights, cap, pause, and last rebalance. Contract read failures never fall back
to demo data. Quotes that require unavailable valuations fail; in-kind previews
retain their separate price-independent path.

## Backend handoff

1. In the repository root, run `forge build` after contract changes.
2. In `web`, run `npm run sync:abi` to export the IndexVault, PriceOracle, and
   ERC20 ABIs from those artifacts. Commit the generated ABIs with the frontend.
3. Configure the deployed vault address and deployment block above.
4. Run `npm test`, `npm run test:integration`, and `npm run build`.
5. Review the configured deployment with a browser wallet before enabling public
   use. The local integration fixture validates mechanics, not live liquidity.

`src/adapters.ts` owns contract reads, previews, and execution. `src/model.ts`
defines the shared adapter/snapshot types and integer validation. Reads use one
block tag per snapshot and refresh every 15 seconds while visible. Submission
refreshes state and simulates the action after allowance confirmation.

Deposits approve only the entered amount. The contract methods have no
minimum-output argument; estimates may change before mining. The UI discloses
this and never invents a slippage guarantee. Withdrawals stay available while
paused if their other prerequisites are satisfied.

Wallet discovery uses EIP-6963 with a legacy injected-provider fallback.
Disconnect ends the UI session without revoking on-chain allowances. There is
no wallet registration, WalletConnect service, analytics, indexer, or keeper
HTTP server dependency. Keeper execution and administrative actions are not
exposed to public users.

## Verification

- `npm test`: bigint parsing, demo accounting, availability rules, docs search,
  failed/replaced receipt handling.
- `npm run test:integration`: starts an isolated Anvil instance on loopback port
  18547 and deploys the actual vault/oracle with mock ERC20/router contracts.
  Requires Foundry artifacts and Anvil on PATH. Tests approval, deposit,
  redemption while paused, idle-liquidity limits, stale prices, in-kind exits,
  and signer mismatch. The test stops its own node afterward.
- `npm run typecheck`: TypeScript checks.
- `npm run test:sites`: retained starter hosting checks.

## Hosting

Serve `dist/client` with fallback-to-index.html for application routes, and
serve `/deployment.json` without long-lived caching. This is a built application,
not an HTML file intended for direct `file://` opening. Fonts are bundled locally.
No public deployment is performed by local build commands.

## Motion

SVG path lengths are measured once per layout/target change. One animation loop
draws paths, counts targets, and positions particles. CSS handles cube motion and
small control transitions. Offscreen/hidden diagrams pause; reduced-motion users
see complete paths and final weights immediately. No WebGL is required.
