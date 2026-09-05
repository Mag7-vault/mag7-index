import { formatUnits, getAddress, isAddress, parseUnits } from "ethers";
export type Action = "deposit" | "redeem" | "inKind";
export type Deployment = {
  environment: "mainnet" | "testnet" | "local";
  chainId: number;
  rpcUrl: string;
  vaultAddress: string;
  deploymentBlock: number;
  explorerUrl: string;
  chainName: string;
  nativeCurrency: { name: string; symbol: string; decimals: number };
};
export type Holding = {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  balance: bigint;
  weight: number | null;
  value: bigint | null;
  priceAt: number;
  stale: boolean;
};
export type Snapshot = {
  mode: "demo" | "contract";
  account: string | null;
  asset: string;
  assetSymbol: string;
  assetDecimals: number;
  shareDecimals: number;
  oracle: string;
  router: string;
  vault: string;
  chainId: number;
  block: number;
  holdings: Holding[];
  nav: bigint | null;
  supply: bigint;
  idle: bigint;
  reserveBps: number;
  cap: bigint;
  paused: boolean;
  weightMode: number;
  lastRebalance: number;
  shares: bigint;
  walletAssets: bigint;
  allowance: bigint;
  maxDeposit: bigint | null;
  maxRedeem: bigint | null;
  maxWithdraw: bigint | null;
  position: bigint | null;
  updatedAt: number;
};
export type Quote = {
  amount: bigint;
  output: bigint;
  tokens: bigint[];
  action: Action;
};
export interface VaultAdapter {
  mode: "demo" | "contract";
  read(account: string | null): Promise<Snapshot>;
  quote(action: Action, amount: bigint, account: string): Promise<Quote>;
  execute(
    action: Action,
    amount: bigint,
    account: string,
    progress: (message: string) => void,
    runner?: import("ethers").Signer,
    isCurrent?: () => boolean,
  ): Promise<string>;
}
export const names: Record<string, string> = {
  NVDA: "NVIDIA",
  AAPL: "Apple",
  GOOGL: "Alphabet",
  QQQ: "Invesco QQQ",
  NFLX: "Netflix",
};
export const demoAccount = "0x000000000000000000000000000000000000dEaD";
export function units(value: bigint | null, decimals = 6, digits = 2) {
  if (value === null) return "Unavailable";
  const [whole, fraction = ""] = formatUnits(value, decimals).split(".");
  return `${BigInt(whole).toLocaleString("en-US")}${digits ? "." + fraction.padEnd(digits, "0").slice(0, digits) : ""}`;
}
export function amountFromInput(input: string, decimals: number) {
  if (!/^(?:\d+)(?:\.\d*)?$/.test(input))
    throw new Error("Enter a positive amount.");
  const amount = parseUnits(input, decimals);
  if (amount <= 0n) throw new Error("Enter an amount greater than zero.");
  return amount;
}
export function percent(value: bigint, total: bigint | null) {
  return total && total > 0n ? Number((value * 10000n) / total) / 100 : 0;
}
export function validate(action: Action, amount: bigint, state: Snapshot) {
  if (amount <= 0n) throw new Error("Enter an amount greater than zero.");
  if (!state.account) throw new Error("Connect your wallet first.");
  if (action === "deposit") {
    if (state.paused)
      throw new Error("Deposits are paused. Exit options remain available.");
    if (state.maxDeposit === null)
      throw new Error("A fresh valuation is required to deposit.");
    if (amount > state.walletAssets)
      throw new Error("This amount exceeds your USDG balance.");
    if (amount > state.maxDeposit)
      throw new Error(
        state.maxDeposit === 0n
          ? "Deposits are closed: the vault cap has been reached."
          : "This amount exceeds the remaining deposit capacity.",
      );
  } else {
    if (amount > state.shares)
      throw new Error("This amount exceeds your MAG7 share balance.");
    if (action === "redeem" && state.maxRedeem === null)
      throw new Error(
        "USDG redemption needs a fresh valuation. Review the in-kind exit instead.",
      );
    if (action === "redeem" && amount > state.maxRedeem!)
      throw new Error(
        "Not enough idle USDG. Redeem a smaller amount, wait for keeper liquidity, or review an in-kind exit.",
      );
  }
}
export function parseDeployment(raw: unknown): Deployment | null {
  if (raw === null) return null;
  const c = raw as Deployment;
  if (
    !c ||
    !["mainnet", "testnet", "local"].includes(c.environment) ||
    !Number.isSafeInteger(c.chainId) ||
    c.chainId < 1 ||
    !isAddress(c.vaultAddress) ||
    /^0x0{40}$/i.test(c.vaultAddress) ||
    !Number.isSafeInteger(c.deploymentBlock) ||
    c.deploymentBlock < 0 ||
    !c.chainName ||
    !c.nativeCurrency?.symbol ||
    c.nativeCurrency.decimals !== 18
  )
    throw new Error("Invalid public deployment configuration.");
  if (c.environment === "mainnet" && c.chainId !== 4663)
    throw new Error("MAG7 mainnet must use chain 4663.");
  const rpc = new URL(c.rpcUrl);
  if (
    !["http:", "https:"].includes(rpc.protocol) ||
    rpc.username ||
    rpc.password
  )
    throw new Error("Invalid public RPC URL.");
  if (c.explorerUrl && new URL(c.explorerUrl).protocol !== "https:")
    throw new Error("Explorer must use HTTPS.");
  return { ...c, vaultAddress: getAddress(c.vaultAddress) };
}
export function friendlyError(error: unknown): string {
  const e = error as {
    code?: string | number;
    shortMessage?: string;
    message?: string;
  };
  if (e.code === "ACTION_REJECTED" || e.code === 4001)
    return "Request declined in your wallet. You can try again.";
  if (e.code === "INSUFFICIENT_FUNDS")
    return "Not enough native gas token to pay the network fee.";
  if (e.code === "CALL_EXCEPTION")
    return "The contract rejected this action. Refresh the vault status and amount, then try again.";
  return (
    e.shortMessage ||
    e.message ||
    "Unable to complete the request. Please try again."
  );
}
