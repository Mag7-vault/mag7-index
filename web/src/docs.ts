export type Article = {
  slug: string;
  title: string;
  summary: string;
  sections: { id: string; title: string; body: string[] }[];
};

export const articles: Article[] = [
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

export function searchArticles(query: string) {
  const q = query.trim().toLowerCase();
  return articles.filter((a) =>
    [a.title, a.summary, ...a.sections.flatMap((s) => [s.title, ...s.body])]
      .join(" ")
      .toLowerCase()
      .includes(q),
  );
}
