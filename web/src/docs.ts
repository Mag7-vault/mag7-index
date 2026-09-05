export type Article = {
  slug: string;
  title: string;
  summary: string;
  sections: { id: string; title: string; body: string[] }[];
};
export const articles: Article[] = [
  {
    slug: "overview",
    title: "Meet MAG7",
    summary: "Five market leaders. One on-chain position.",
    sections: [
      {
        id: "what-you-own",
        title: "What you hold",
        body: [
          "MAG7 is an ERC-4626 vault. Deposit USDG to receive transferable MAG7 shares representing a proportional claim on the assets held by the vault. Share value changes with the underlying holdings; returns are not guaranteed.",
          "A vault share is not direct ownership of company stock. The basket contains tokenized-equity assets, whose issuer terms and restrictions must be understood separately.",
        ],
      },
      {
        id: "five-assets",
        title: "Why five, not seven?",
        body: [
          "The initial basket is NVIDIA (NVDA), Apple (AAPL), Alphabet (GOOGL), Advanced Micro Devices (AMD), and Netflix (NFLX). Each targets 20% of the invested basket, not 20% of the entire vault.",
          "The current integration executes Voxelithic v3 routes. At the September 5, 2026 integration review, Microsoft was unavailable in the integrated token list; Meta, Tesla and Amazon required v4 routing. The selected five had v3 routes at that review. Venue availability can change, and supported assets can change through governance. The Basket page shows the configured vault's actual holdings.",
        ],
      },
      {
        id: "review-mode",
        title: "Preview and live environments",
        body: [
          "A Demo label means balances and transactions are simulated in this browser. No wallet signature or funds are required for a demo. Reloading resets it.",
          "Configured deployments read the vault directly. Testnet and local deployments are mechanics tests, not evidence of mainnet liquidity or launch approval. Check the environment and contract address before using funds.",
        ],
      },
    ],
  },
  {
    slug: "wallet",
    title: "Connect your wallet",
    summary: "Accounts, networks, and network fees.",
    sections: [
      {
        id: "connect",
        title: "Choose a browser wallet",
        body: [
          "Select Connect wallet and choose an installed wallet. Approve sharing the account you want to use. Connecting does not grant token spending permission.",
          "This version supports injected browser wallets, including compatible wallet-app browsers. Mobile QR connections are not included. Install a wallet from its official source if none is detected.",
        ],
      },
      {
        id: "network",
        title: "Use the correct network",
        body: [
          "The site uses the network in its deployment configuration. Robinhood mainnet uses chain 4663; the project testnet uses 46630. A local fixture may use 31337.",
          "Use Switch network when prompted. Obtain the configured native gas token through the network’s official resources and use official testnet faucets only for testnet funds. This site does not bridge or sell gas tokens.",
        ],
      },
      {
        id: "account",
        title: "Account changes and disconnecting",
        body: [
          "Changing an account or network clears the active preview. Review the refreshed balances before submitting again.",
          "Disconnect removes this site’s active session. It does not revoke an existing on-chain token allowance; manage allowances through your wallet if needed.",
        ],
      },
    ],
  },
  {
    slug: "deposits",
    title: "Deposit USDG",
    summary: "Understand approvals, previews, and vault shares.",
    sections: [
      {
        id: "steps",
        title: "Make a deposit",
        body: [
          "Connect a wallet, open Vault → Deposit, and enter a USDG amount. The site checks your balance and the vault’s remaining deposit capacity. Select Review to see the estimated shares.",
          "If needed, approve only the entered USDG amount for the vault. Approval is a separate transaction with its own network fee. After it confirms, the app refreshes limits and the share preview, simulates the deposit, then requests your deposit transaction.",
        ],
      },
      {
        id: "shares",
        title: "How shares are calculated",
        body: [
          "Shares represent your proportional interest in the vault, not a guaranteed one-USDG price. The contract determines their quantity using its current valuation and ERC-4626 accounting.",
          "Previews are estimates. The current deposit and redemption methods do not include a user-supplied minimum-output bound; the final result can change before transaction execution. The app rechecks immediately before requesting a signature, but cannot eliminate that risk.",
        ],
      },
      {
        id: "closed",
        title: "When deposits are unavailable",
        body: [
          "A zero or exhausted deposit cap, a paused vault, or unavailable required prices can prevent deposits. A connected wallet alone does not mean deposits are open.",
          "Deposits initially enter as USDG. The keeper later trades to rebalance the basket; the animated flow is an explanation, not a live transaction trace.",
        ],
      },
    ],
  },
  {
    slug: "withdrawals",
    title: "Withdraw and exit",
    summary: "USDG redemption and direct basket-token exits.",
    sections: [
      {
        id: "usdg",
        title: "Redeem for available USDG",
        body: [
          "Enter MAG7 shares in the Redeem USDG tab. The site reads the contract’s maxRedeem and maxWithdraw limits rather than assuming the entire vault is immediately liquid.",
          "If your withdrawal exceeds the available USDG, reduce the amount, wait for keeper sell-down, or consider an in-kind exit. There is no withdrawal queue or guaranteed waiting period in this version.",
        ],
      },
      {
        id: "in-kind",
        title: "Exit in kind",
        body: [
          "In-kind Exit burns your shares and returns your proportional share of idle USDG and every basket token. Review each token quantity before confirming. This does not automatically sell those tokens for USDG.",
          "The in-kind preview does not need fresh oracle prices. It remains available when valuations are stale and while the vault is paused, subject to your share balance and successful token transfers. Token transfer restrictions can still affect an exit.",
        ],
      },
      {
        id: "pause",
        title: "Exits during a pause",
        body: [
          "A pause blocks deposits and rebalancing. It does not itself block ordinary USDG redemption within the available liquidity. Standard exits still require the necessary valuation reads to succeed.",
          "Network fees apply to exits. Quotes are estimates; the existing methods do not accept a minimum amount-out parameter.",
        ],
      },
    ],
  },
  {
    slug: "allocation",
    title: "Weights and rebalancing",
    summary: "The distinction between basket weights and vault allocation.",
    sections: [
      {
        id: "weights",
        title: "20% of the basket",
        body: [
          "Five equal basket weights sum to 100% of the invested portion. When 20% of the vault is idle USDG and 80% is invested, a 20% basket target corresponds to approximately 16% of total vault value for each stock.",
          "Current allocations can differ because of price movement, deposits, withdrawals, or partial rebalances. The Basket page separates target weights from actual vault weights.",
        ],
      },
      {
        id: "reserve",
        title: "The USDG reserve",
        body: [
          "At least 20% of NAV must remain idle USDG after each keeper rebalance. This is a post-rebalance requirement, not a promise that the balance can never fall below 20%. Redemptions can consume the reserve.",
          "The keeper can sell basket assets back to USDG to restore liquidity. The dedicated restoration path can operate without fresh oracle prices, but it is blocked while paused.",
        ],
      },
      {
        id: "modes",
        title: "Static and market-cap modes",
        body: [
          "The initial configuration uses static equal weights. The contracts also support governance-enabled market-cap weighting, a single-name cap, and controlled permissionless rebalancing. These should not be assumed active.",
          "The interface reads the current weight mode and resolved weights from the contract. Missing market-cap data is shown as unavailable, not replaced with equal weights.",
        ],
      },
    ],
  },
  {
    slug: "valuation",
    title: "Prices and NAV",
    summary: "What a valuation means and when it is unavailable.",
    sections: [
      {
        id: "nav",
        title: "Net asset value",
        body: [
          "NAV is idle USDG plus held basket tokens valued using the vault’s on-chain oracle. Your position estimate is derived from contract share accounting. It is not a guaranteed sale price.",
          "A keeper obtains Voxelithic quotes off-chain and posts prices to PriceOracle. The vault does not call the revert-to-return quoter inside totalAssets.",
        ],
      },
      {
        id: "freshness",
        title: "Price freshness",
        body: [
          "The oracle has a configurable staleness limit. Missing or stale prices for held tokens cause valuation reads to fail rather than silently display outdated values.",
          "When required valuations are unavailable, the UI removes the estimate and blocks dependent actions. Raw balances and in-kind token previews can still be shown.",
        ],
      },
      {
        id: "risks",
        title: "Quotes and execution",
        body: [
          "Market liquidity, price impact, token restrictions, and delays can change realizable value. Oracle freshness is not a guarantee of price accuracy.",
          "The site refreshes visible data periodically and after transactions. The last update time identifies the displayed snapshot; it is not a promise of continuous live pricing.",
        ],
      },
    ],
  },
  {
    slug: "governance",
    title: "Governance and status",
    summary: "Controls, contract addresses, and launch status.",
    sections: [
      {
        id: "roles",
        title: "Who controls what?",
        body: [
          "Governance can change permitted configuration through the owner. The intended production setup uses a Safe multisig and a timelock; deployment and ownership handover must be verified for the specific contract.",
          "A guardian can pause deposits and rebalancing. Unpausing and configuration changes belong to the owner. Price and rebalance keeper roles have separate responsibilities.",
        ],
      },
      {
        id: "addresses",
        title: "Verify the deployment",
        body: [
          "The Vault page shows configured chain and contract addresses, deriving asset, oracle, and router addresses from the vault. Use explorer links to inspect the selected deployment.",
          "A matching interface or wallet connection is not an audit certificate. The repository identifies the project as pre-production; no independent approval or public launch date is inferred by this site.",
        ],
      },
      {
        id: "privacy",
        title: "Local connection and privacy",
        body: [
          "No account registration is required. Wallet addresses and transaction information are sent to the configured RPC provider when contract mode is used. Blockchain transactions are public.",
          "Demo activity stays in browser memory. The site stores only your motion preference locally and does not include analytics. Your wallet and RPC provider may have their own privacy practices.",
        ],
      },
    ],
  },
  {
    slug: "risks",
    title: "Understand the risks",
    summary: "Read before moving funds.",
    sections: [
      {
        id: "market",
        title: "Market and issuer risk",
        body: [
          "The basket is concentrated in five growth companies. Asset values can fall together. Tokenized assets introduce issuer, custody, redemption, regulatory, and transfer-restriction risks beyond ordinary market movement.",
          "USDG also has stablecoin and issuer risks. An idle reserve is not insurance or a guarantee of redemption at a fixed price.",
        ],
      },
      {
        id: "protocol",
        title: "Protocol and operational risk",
        body: [
          "Smart contracts, governance, wallets, RPC providers, keepers, oracles, and external routers can fail or be compromised. A stale or inaccurate price can affect availability or value.",
          "Liquidity can be insufficient for immediate USDG redemption. In-kind exits transfer the basket assets to you and may leave you responsible for selling them.",
        ],
      },
      {
        id: "review",
        title: "Before proceeding",
        body: [
          "Confirm the environment, contract address, amount, token outputs, and wallet transaction details. Use only amounts whose risks you understand.",
          "This documentation explains software behavior. It does not provide investment advice, promise returns, or substitute for the token issuers’ terms or an independent audit.",
        ],
      },
    ],
  },
  {
    slug: "help",
    title: "Troubleshooting and glossary",
    summary: "Common states, clear explanations.",
    sections: [
      {
        id: "errors",
        title: "Common problems",
        body: [
          "No wallet found: open the site in a compatible browser with a wallet installed. Wrong network: switch to the configured chain. Request declined: review the amount and retry when ready.",
          "Insufficient gas: obtain the correct native token. Deposit closed: check pause and cap status. Valuation unavailable: wait for fresh prices or review an in-kind exit. Insufficient USDG liquidity: lower the exit amount or review the alternatives.",
          "A pending transaction is not a confirmed transaction. Check its status in your wallet or explorer. Changing accounts during submission does not cancel an already broadcast transaction.",
        ],
      },
      {
        id: "glossary",
        title: "Glossary",
        body: [
          "USDG: the vault’s base asset. MAG7: the vault share token. NAV: the total oracle-valued assets held by the vault. ERC-4626: a standard tokenized-vault interface.",
          "Keeper: an authorized service that posts prices or executes rebalances. Oracle: on-chain price storage. Basis points: one hundredth of a percent; 2,000 bps equals 20%.",
          "In-kind exit: receipt of the underlying tokens instead of a USDG-only payout. Timelock: a delay before scheduled governance actions can execute.",
        ],
      },
    ],
  },
];
export function searchArticles(query: string) {
  const q = query.trim().toLowerCase();
  return articles.filter((a) =>
    [a.title, a.summary, ...a.sections.flatMap((s) => [s.title, ...s.body])]
      .join(" ")
      .toLowerCase()
      .includes(q),
  );
}
