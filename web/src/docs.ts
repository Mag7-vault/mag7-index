export type DocBlock =
  | {
      type: "code";
      label?: string;
      code: string;
    }
  | {
      type: "links";
      items: { label: string; href: string; note?: string }[];
    }
  | {
      type: "table";
      columns: string[];
      rows: string[][];
    }
  | {
      type: "note";
      label?: string;
      text: string;
    };

export type Article = {
  slug: string;
  title: string;
  summary: string;
  sections: {
    id: string;
    title: string;
    body: string[];
    blocks?: DocBlock[];
  }[];
};

export const userArticles: Article[] = [
  {
    slug: "overview",
    title: "How MAG7 works",
    summary: "Five market exposures in one vault position.",
    sections: [
      {
        id: "simple",
        title: "The simple version",
        body: [
          "You deposit USDG and receive MAG7 shares. Those shares represent your portion of the assets held by the vault.",
          "The vault spreads invested funds equally across NVIDIA, Apple, Alphabet, QQQ and Netflix, while keeping part of the vault in USDG for withdrawals.",
        ],
      },
      {
        id: "what-you-hold",
        title: "What you hold",
        body: [
          "You hold MAG7 vault shares, not company shares in a brokerage account. Their value can rise or fall with the vault's holdings.",
          "QQQ is an ETF and includes some of the same companies already named in the basket, so the five exposures are not completely separate from one another.",
        ],
      },
      {
        id: "check-first",
        title: "Before you continue",
        body: [
          "Check that the site shows Robinhood Chain mainnet and that deposits are available. A connected wallet does not automatically mean deposits are open.",
          "Only use an amount you can afford to keep exposed to market, token and smart-contract risks.",
        ],
      },
    ],
  },
  {
    slug: "wallet",
    title: "Connect safely",
    summary: "Choose the right wallet, account and network.",
    sections: [
      {
        id: "connect",
        title: "Connect your wallet",
        body: [
          "Select Connect wallet and choose the account you want to use. Connecting lets the site read that account; it does not move your money.",
          "Never share your private key or recovery phrase. MAG7 support should never ask for either one.",
        ],
      },
      {
        id: "network",
        title: "Check the network",
        body: [
          "The live vault uses Robinhood Chain mainnet. Use Switch network if your wallet is connected to another network.",
          "You need a small amount of the network's native token to pay transaction fees. USDG cannot pay those fees.",
        ],
      },
      {
        id: "disconnect",
        title: "Changing or disconnecting",
        body: [
          "If you change accounts or networks, review your balance and transaction again before signing.",
          "Disconnecting the site does not cancel a transaction that was already submitted and does not automatically remove an earlier token approval.",
        ],
      },
    ],
  },
  {
    slug: "deposits",
    title: "Deposit USDG",
    summary: "Review the amount, approve USDG and receive MAG7 shares.",
    sections: [
      {
        id: "steps",
        title: "How to deposit",
        body: [
          "Connect your wallet, open Vault → Deposit, enter an amount and select Review deposit.",
          "Your first deposit may require two wallet confirmations: one to allow the vault to use the entered USDG amount, and another to make the deposit.",
          "Wait for confirmation, then refresh your position. Your MAG7 share balance will appear when the transaction has been processed.",
        ],
      },
      {
        id: "preview",
        title: "About the preview",
        body: [
          "The share amount shown before you sign is an estimate. It can change slightly before the transaction is completed.",
          "MAG7 shares are not fixed at one USDG. Their value depends on the assets held by the vault.",
        ],
      },
      {
        id: "unavailable",
        title: "If deposits are unavailable",
        body: [
          "Deposits may be closed, temporarily paused or at their current limit. The page will show when the vault is not accepting more USDG.",
          "Do not send USDG directly to the vault address. Always deposit through the Deposit flow in the app.",
        ],
      },
    ],
  },
  {
    slug: "withdrawals",
    title: "Withdraw or exit",
    summary: "Choose USDG or receive your portion of the basket.",
    sections: [
      {
        id: "usdg",
        title: "Withdraw as USDG",
        body: [
          "Open Redeem USDG, enter the MAG7 shares you want to redeem and review the amount available before signing.",
          "The vault keeps some USDG ready for withdrawals, but it may not be enough for every request immediately. The app shows the amount currently available to you.",
        ],
      },
      {
        id: "in-kind",
        title: "Receive the basket instead",
        body: [
          "If enough USDG is not available, In-kind Exit lets you exchange MAG7 shares for your portion of the vault's USDG and basket tokens.",
          "This option does not sell those basket tokens for you. You receive them in your wallet and may need to sell them separately if you want USDG.",
        ],
      },
      {
        id: "important",
        title: "Important to know",
        body: [
          "There is no guaranteed waiting time or guaranteed USDG amount. Market movement, available liquidity and token restrictions can affect your exit.",
          "Always check the token amounts and wallet transaction details before confirming. Network fees apply.",
        ],
      },
    ],
  },
  {
    slug: "allocation",
    title: "The basket and reserve",
    summary: "See where the vault aims to hold its assets.",
    sections: [
      {
        id: "basket",
        title: "The five basket targets",
        body: [
          "The invested part of the vault targets 20% each in NVIDIA, Apple, Alphabet, QQQ and Netflix.",
          "That 20% is a share of the invested basket, not the whole vault. If 20% of the vault is held as USDG, each balanced basket position is about 16% of the total vault value.",
        ],
      },
      {
        id: "reserve",
        title: "Why the vault keeps USDG",
        body: [
          "After rebalancing, the vault is designed to keep at least 20% in USDG to support ordinary withdrawals.",
          "Withdrawals can reduce that reserve, so 20% is not a promise that the same amount will always be available.",
        ],
      },
      {
        id: "changes",
        title: "Why the live balance can differ",
        body: [
          "Prices move and people deposit or withdraw, so actual holdings may differ from their targets between rebalances.",
          "Use the Basket page for the latest holdings and available reserve shown by the vault.",
        ],
      },
    ],
  },
  {
    slug: "valuation",
    title: "Your balance and value",
    summary: "Understand estimates and unavailable prices.",
    sections: [
      {
        id: "estimate",
        title: "Your position estimate",
        body: [
          "The app estimates your position from your MAG7 shares and the latest prices available to the vault. It is not a guaranteed sale price.",
          "Prices and liquidity can change between the preview and the completed transaction.",
        ],
      },
      {
        id: "unavailable",
        title: "If a value says unavailable",
        body: [
          "The app hides estimates when a required price is missing or too old instead of showing an outdated value as current.",
          "You can still view raw holdings and may still be able to use In-kind Exit. Do not continue with a transaction you do not understand.",
        ],
      },
    ],
  },
  {
    slug: "governance",
    title: "Safety and status",
    summary: "How changes are controlled and what a pause means.",
    sections: [
      {
        id: "controls",
        title: "Changes are delayed",
        body: [
          "Important vault changes require approval from more than one owner and then wait 48 hours before they can take effect.",
          "A safety operator can pause new deposits and rebalancing if there is a problem.",
        ],
      },
      {
        id: "pause",
        title: "What happens during a pause",
        body: [
          "A pause stops new deposits and rebalancing. It does not take away your MAG7 shares.",
          "USDG withdrawals may still work when enough USDG and a current value are available. In-kind Exit is intended to remain available even when prices are unavailable.",
        ],
      },
      {
        id: "privacy",
        title: "Privacy",
        body: [
          "No account registration is required. Your wallet address and transactions are public on the blockchain.",
          "Your wallet and network provider may process connection information under their own privacy terms. Never put private keys or recovery phrases into this site.",
        ],
      },
    ],
  },
  {
    slug: "risks",
    title: "Understand the risks",
    summary: "Read this before moving funds.",
    sections: [
      {
        id: "market",
        title: "Value can fall",
        body: [
          "The basket is concentrated in five growth-focused exposures, and several can fall at the same time. QQQ also overlaps with some basket companies.",
          "USDG and tokenized market assets carry their own issuer, custody, liquidity, transfer and regulatory risks.",
        ],
      },
      {
        id: "technology",
        title: "Technology can fail",
        body: [
          "Smart contracts, wallets, price updates, network providers and trading services can fail, be delayed or be compromised.",
          "Available USDG may be insufficient for an immediate withdrawal. An in-kind exit can leave you holding tokens that may be difficult or restricted to sell.",
        ],
      },
      {
        id: "responsibility",
        title: "Review every transaction",
        body: [
          "Confirm the network, amount, destination and expected tokens in your wallet before signing. Blockchain transactions usually cannot be reversed.",
          "MAG7 does not guarantee returns and this guide is not investment advice or an independent security audit.",
        ],
      },
    ],
  },
  {
    slug: "help",
    title: "Help",
    summary: "Common problems and what to do next.",
    sections: [
      {
        id: "common",
        title: "Common problems",
        body: [
          "Wrong network: switch to Robinhood Chain mainnet. Insufficient gas: add the network's native token. Request declined: review the transaction and try again when ready.",
          "Deposit unavailable: the vault may be closed, paused or at its limit. Balance unavailable: wait for updated pricing. Not enough USDG to withdraw: lower the amount or review In-kind Exit.",
        ],
      },
      {
        id: "pending",
        title: "Pending transactions",
        body: [
          "A submitted transaction is not complete until your wallet or the explorer shows it as confirmed.",
          "Changing accounts or closing the page does not cancel a transaction that has already been submitted.",
        ],
      },
    ],
  },
];

export const projectArticles: Article[] = [
  {
    slug: "project-overview",
    title: "Project overview",
    summary: "The product, its scope and the first mainnet release.",
    sections: [
      {
        id: "purpose",
        title: "Purpose",
        body: [
          "MAG7 Index Vault packages a basket of tokenized market exposures into one on-chain share position on Robinhood Chain. USDG is the entry asset, MAG7 is the vault share, and the vault records each holder's proportional ownership.",
          "The first release focuses on a small, understandable basket and a controlled launch. It is not a brokerage account, an issuer of company stock or an officially affiliated Robinhood product.",
        ],
      },
      {
        id: "release",
        title: "Version one",
        body: [
          "The launch basket is NVIDIA, Apple, Alphabet, QQQ and Netflix. Each targets 20% of the invested portion, while at least 20% of vault value is intended to remain in USDG after rebalancing.",
          "MAG7 uses Voxelithic's v3 routes for basket trades. QQQ replaced AMD because the selected QQQ route was executable in the final mainnet-fork rehearsal. Broader asset support can follow when additional route families are integrated.",
        ],
      },
      {
        id: "scope",
        title: "What ships separately",
        body: [
          "The vault is the public product. The price layer is currently an internal service that supports vault valuation; it should not yet be marketed as a general-purpose oracle network.",
          "Oracle V2 is a separate roadmap item covering multiple reporters, median or quorum pricing, per-asset limits, richer price metadata and a standard integration interface.",
        ],
      },
    ],
  },
  {
    slug: "project-architecture",
    title: "System architecture",
    summary: "How deposits, prices, trades and exits fit together.",
    sections: [
      {
        id: "flow",
        title: "Core flow",
        body: [
          "A user deposits USDG into IndexVault and receives MAG7 shares. A price service obtains current Voxelithic quotes and records them in PriceOracle. A separate rebalance service builds approved Voxelithic trades that move the vault toward its target basket.",
          "The vault values its holdings from stored prices, enforces the configured basket and reserve rules, and limits each action to the permissions built into the contracts.",
        ],
        blocks: [
          {
            type: "code",
            label: "System flow",
            code: "User --USDG--> IndexVault --keeper--> VoxRouter --> liquidity pools\n                   ^                                      |\n                   |                                      v\n              PriceOracle <--- price keeper <--- Voxelithic quotes",
          },
        ],
      },
      {
        id: "components",
        title: "Main components",
        body: [
          "IndexVault handles deposits, shares, portfolio value, USDG redemptions, in-kind exits and approved rebalances. PriceOracle stores timestamped prices and refuses missing, zero or stale values.",
          "The keeper package posts prices, checks routes and health, and prepares rebalances. Voxelithic supplies the external quote and execution paths. The web app reads the deployed contracts and asks the connected wallet to sign user transactions.",
        ],
      },
      {
        id: "boundaries",
        title: "Trust boundaries",
        body: [
          "Price posting, rebalancing and governance use separate wallets. A price reporter cannot change vault configuration, and a rebalance operator cannot change ownership or the basket.",
          "External dependencies include Robinhood Chain, USDG, the basket-token issuers, Voxelithic routes, the RPC provider, browser wallets and the operational keeper runner.",
        ],
      },
    ],
  },
  {
    slug: "project-contracts",
    title: "Mainnet contracts",
    summary: "Canonical addresses for the Robinhood Chain deployment.",
    sections: [
      {
        id: "addresses",
        title: "Deployment addresses",
        body: [
          "These are the canonical addresses recorded for the first Robinhood Chain mainnet deployment. Always compare the complete address before interacting.",
        ],
        blocks: [
          {
            type: "table",
            columns: ["Component", "Address", "Purpose"],
            rows: [
              [
                "IndexVault",
                "0xaAF58BD0Dfe5aD5514f421C02959ef44D2fB0ca8",
                "ERC-4626 shares, deposits and exits",
              ],
              [
                "PriceOracle",
                "0x117C44F8Ed3E57490c14B475ba086c58A2335778",
                "Timestamped USDG prices",
              ],
              [
                "Timelock",
                "0xBC8A2ac01AeEb849A15825e9FA12ebFBe83Dd8d8",
                "48-hour governance delay",
              ],
              [
                "Safe / guardian",
                "0x5A205159348BBe6c4A5a264B59fC8Df7A4ab6a39",
                "2-of-3 approvals and emergency pause",
              ],
              [
                "USDG",
                "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168",
                "Vault accounting and deposit asset",
              ],
            ],
          },
          {
            type: "links",
            items: [
              {
                label: "IndexVault on Blockscout",
                href: "https://robinhoodchain.blockscout.com/address/0xaAF58BD0Dfe5aD5514f421C02959ef44D2fB0ca8",
              },
              {
                label: "PriceOracle on Blockscout",
                href: "https://robinhoodchain.blockscout.com/address/0x117C44F8Ed3E57490c14B475ba086c58A2335778",
              },
              {
                label: "Timelock on Blockscout",
                href: "https://robinhoodchain.blockscout.com/address/0xBC8A2ac01AeEb849A15825e9FA12ebFBe83Dd8d8",
              },
              {
                label: "Governance Safe on Blockscout",
                href: "https://robinhoodchain.blockscout.com/address/0x5A205159348BBe6c4A5a264B59fC8Df7A4ab6a39",
              },
            ],
          },
        ],
      },
      {
        id: "identity",
        title: "Release identity",
        body: [
          "Network: Robinhood Chain mainnet, chain ID 4663. Initial deployment block: 55387046. Solidity compiler: 0.8.26.",
          "The mainnet deployment was created from frozen candidate e1c7d91fd8dfa7818ef639c77aa3809903a54dc5. Public source verification on Blockscout remains a launch task until the explorer displays matching verified source.",
        ],
      },
      {
        id: "verify",
        title: "How to verify",
        body: [
          "Use robinhoodchain.blockscout.com and confirm the full address, network and bytecode before relying on a contract. Do not trust an address copied from an unofficial post or direct message.",
          "The Vault page also displays the configured vault, USDG, price and router addresses read from the active deployment.",
        ],
        blocks: [
          {
            type: "note",
            label: "Source status",
            text: "Repository records show exact Sourcify matches for IndexVault and PriceOracle. Blockscout source publication remains a separate explorer-indexing task until its contract pages display matching verified source.",
          },
        ],
      },
    ],
  },
  {
    slug: "project-oracle",
    title: "Pricing and oracle",
    summary: "How version one prices the vault and where V2 goes next.",
    sections: [
      {
        id: "v1",
        title: "Version-one price flow",
        body: [
          "MAG7 reads executable-size quotes through Voxelithic. The price keeper obtains those quotes with an off-chain call and posts timestamped 18-decimal USDG prices to PriceOracle so IndexVault can value its holdings during contract calls.",
          "Held assets require a non-zero price that is still inside the allowed age. If a required price is unavailable or too old, dependent valuation and deposit actions fail instead of silently using it.",
        ],
        blocks: [
          {
            type: "code",
            label: "PriceOracle read surface",
            code: "postPrices(address[] tokens, uint256[] priceUsdg18)\ngetPrice(address token) returns (uint256 priceUsdg)\nprices(address token) returns (uint192 priceUsdg, uint64 updatedAt)\nmaxStaleness() returns (uint256)",
          },
        ],
      },
      {
        id: "limitations",
        title: "Current limitations",
        body: [
          "Version one relies on one authorized price reporter and one primary quote path. Freshness checks prevent old data from being accepted as current, but freshness alone does not prove that a price is correct.",
          "Keeper uptime, gas funding, RPC availability and route health are operational requirements. In-kind exits avoid a live price dependency and remain the final user escape path.",
        ],
        blocks: [
          {
            type: "note",
            label: "Not a public oracle network",
            text: "PriceOracle V1 accepts one authorized reporting path. It is a vault dependency, not a manipulation-resistant, multi-reporter feed for unrelated protocols.",
          },
        ],
      },
      {
        id: "v2",
        title: "Oracle V2 roadmap",
        body: [
          "V2 is intended to add multiple independent reporters, median or quorum aggregation, maximum deviation rules, per-asset circuit breakers and explicit round, source, decimal and heartbeat information.",
          "A Chainlink-compatible latestRoundData interface would make the resulting feed easier for other Robinhood Chain applications to consume. This work is planned, not part of the deployed V1 claim set.",
        ],
      },
    ],
  },
  {
    slug: "project-governance",
    title: "Governance and safety",
    summary: "Roles, delayed changes, pause controls and user exits.",
    sections: [
      {
        id: "governance",
        title: "Safe and timelock",
        body: [
          "Production governance uses a 2-of-3 Safe. Approved configuration changes are scheduled through a 48-hour timelock before execution.",
          "The Safe is the timelock proposer and executor and also acts as the vault guardian. The original deployer is not a timelock administrator.",
        ],
      },
      {
        id: "roles",
        title: "Separated roles",
        body: [
          "The oracle keeper posts prices. The rebalance keeper executes permitted basket trades. The guardian can pause deposits and rebalancing. Governance controls configuration and can replace compromised operators.",
          "The deployer, keeper wallets and Safe owners are intentionally separate. Private keys and RPC credentials are never stored in the public web build.",
        ],
        blocks: [
          {
            type: "table",
            columns: ["Role", "Can", "Cannot"],
            rows: [
              [
                "Governance Safe",
                "Approve delayed configuration changes",
                "Bypass the timelock for owner-only setters",
              ],
              [
                "Guardian",
                "Pause deposits and rebalancing",
                "Unpause or rewrite configuration",
              ],
              [
                "Oracle keeper",
                "Post prices and market caps",
                "Move vault assets or change governance",
              ],
              [
                "Rebalance keeper",
                "Execute permitted basket trades",
                "Change ownership, basket rules or oracle reporters",
              ],
              [
                "User",
                "Deposit, redeem or exit in kind",
                "Call keeper-only or owner-only operations",
              ],
            ],
          },
        ],
      },
      {
        id: "exits",
        title: "Safety exits",
        body: [
          "A pause blocks deposits and rebalancing but does not confiscate shares. Ordinary USDG redemption remains available within current liquidity when valuation works.",
          "In-kind Exit burns shares and returns the holder's proportional USDG and basket tokens without requiring current prices. Token transfer restrictions can still affect delivery.",
        ],
      },
    ],
  },
];

export const articles: Article[] = [...userArticles, ...projectArticles];

export function searchArticles(query: string) {
  const q = query.trim().toLowerCase();
  return articles.filter((a) =>
    [
      a.title,
      a.summary,
      ...a.sections.flatMap((s) => [
        s.title,
        ...s.body,
        ...(s.blocks ?? []).flatMap((block) => {
          if (block.type === "code") return [block.label ?? "", block.code];
          if (block.type === "note") return [block.label ?? "", block.text];
          if (block.type === "links")
            return block.items.flatMap((item) => [item.label, item.note ?? ""]);
          return [...block.columns, ...block.rows.flat()];
        }),
      ]),
    ]
      .join(" ")
      .toLowerCase()
      .includes(q),
  );
}
