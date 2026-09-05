import {
  Contract,
  JsonRpcProvider,
  ZeroAddress,
  type Signer,
  type ContractTransactionResponse,
} from "ethers";
import vaultAbi from "./abi/IndexVault.json";
import oracleAbi from "./abi/PriceOracle.json";
import tokenAbi from "./abi/ERC20.json";
import {
  names,
  validate,
  type Action,
  type Deployment,
  type Snapshot,
  type Quote,
  type VaultAdapter,
} from "./model";

const optional = async <T>(p: Promise<T>): Promise<T | null> => {
  try {
    return await p;
  } catch (e) {
    if ((e as { code?: string }).code === "CALL_EXCEPTION") return null;
    throw e;
  }
};
export async function confirmed(
  tx: ContractTransactionResponse,
): Promise<string> {
  try {
    const receipt = await tx.wait();
    if (!receipt || receipt.status !== 1)
      throw new Error("Transaction was not successful.");
    return receipt.hash;
  } catch (e) {
    const r = e as {
      code?: string;
      cancelled?: boolean;
      receipt?: { status: number; hash: string };
    };
    if (
      r.code === "TRANSACTION_REPLACED" &&
      !r.cancelled &&
      r.receipt?.status === 1
    )
      return r.receipt.hash;
    if (r.cancelled) throw new Error("Transaction cancelled in your wallet.");
    throw e;
  }
}
export class ContractAdapter implements VaultAdapter {
  mode = "contract" as const;
  provider: JsonRpcProvider;
  vault: Contract;
  constructor(public config: Deployment) {
    this.provider = new JsonRpcProvider(config.rpcUrl, undefined, {
      cacheTimeout: -1,
    });
    this.vault = new Contract(config.vaultAddress, vaultAbi, this.provider);
  }
  async read(account: string | null): Promise<Snapshot> {
    if (
      Number((await this.provider.getNetwork()).chainId) !== this.config.chainId
    )
      throw new Error("RPC network does not match deployment configuration.");
    const block = await this.provider.getBlock("latest");
    if (!block) throw new Error("RPC did not return the latest block.");
    if (
      block.number < this.config.deploymentBlock ||
      (await this.provider.getCode(this.config.vaultAddress)) === "0x"
    )
      throw new Error("Vault deployment is not available on this network.");
    const at = { blockTag: block.number };
    const v = this.vault;
    const [
      asset,
      oracle,
      router,
      count,
      supply,
      paused,
      cap,
      reserveBps,
      weightMode,
      lastRebalance,
      shareDecimals,
    ] = await Promise.all([
      v.asset(at),
      v.oracle(at),
      v.router(at),
      v.basketLength(at),
      v.totalSupply(at),
      v.paused(at),
      v.depositCap(at),
      v.MIN_IDLE_USDG_BPS(at),
      v.weightMode(at),
      v.lastRebalanceAt(at),
      v.decimals(at),
    ]);
    const token = new Contract(asset, tokenAbi, this.provider);
    const prices = new Contract(oracle, oracleAbi, this.provider);
    const [assetDecimals, assetSymbol, idle, staleness] = await Promise.all([
      token.decimals(at),
      token.symbol(at),
      token.balanceOf(v.target, at),
      prices.maxStaleness(at),
    ]);
    const holdings = await Promise.all(
      Array.from({ length: Number(count) }, async (_, i) => {
        const address = await v.basketTokens(i, at);
        const t = new Contract(address, tokenAbi, this.provider);
        const [symbol, name, decimals, balance, weight, price] =
          await Promise.all([
            t.symbol(at),
            t.name(at),
            t.decimals(at),
            t.balanceOf(v.target, at),
            optional<bigint>(v.targetWeight(address, at)),
            prices.prices(address, at),
          ]);
        const stale =
          price.updatedAt === 0n ||
          BigInt(block.timestamp) - price.updatedAt > staleness;
        return {
          address,
          symbol,
          name,
          decimals: Number(decimals),
          balance: BigInt(balance),
          weight: weight === null ? null : Number(weight),
          value:
            balance === 0n
              ? 0n
              : stale
                ? null
                : (BigInt(balance) * BigInt(price.priceUsdg)) / 10n ** 18n,
          priceAt: Number(price.updatedAt),
          stale,
        };
      }),
    );
    const owner = account || ZeroAddress;
    const [
      nav,
      shares,
      walletAssets,
      allowance,
      maxDeposit,
      maxRedeem,
      maxWithdraw,
    ] = await Promise.all([
      optional<bigint>(v.totalAssets(at)),
      v.balanceOf(owner, at),
      token.balanceOf(owner, at),
      token.allowance(owner, v.target, at),
      optional<bigint>(v.maxDeposit(owner, at)),
      optional<bigint>(v.maxRedeem(owner, at)),
      optional<bigint>(v.maxWithdraw(owner, at)),
    ]);
    const position = await optional<bigint>(v.convertToAssets(shares, at));
    return {
      mode: this.mode,
      account,
      asset,
      assetSymbol,
      assetDecimals: Number(assetDecimals),
      shareDecimals: Number(shareDecimals),
      oracle,
      router,
      vault: String(v.target),
      chainId: this.config.chainId,
      block: block.number,
      holdings,
      nav,
      supply,
      idle,
      reserveBps: Number(reserveBps),
      cap,
      paused,
      weightMode: Number(weightMode),
      lastRebalance: Number(lastRebalance),
      shares,
      walletAssets,
      allowance,
      maxDeposit,
      maxRedeem,
      maxWithdraw,
      position,
      updatedAt: block.timestamp,
    };
  }
  async quote(action: Action, amount: bigint, account: string): Promise<Quote> {
    validate(action, amount, await this.read(account));
    if (action === "inKind") {
      const q = await this.vault.previewRedeemInKind(amount);
      return { action, amount, output: q[0], tokens: [...q[1]] };
    }
    return {
      action,
      amount,
      output:
        await this.vault[
          action === "deposit" ? "previewDeposit" : "previewRedeem"
        ](amount),
      tokens: [],
    };
  }
  async execute(
    action: Action,
    amount: bigint,
    account: string,
    progress: (s: string) => void,
    signer?: Signer,
    isCurrent: () => boolean = () => true,
  ): Promise<string> {
    const checkSession = () => {
      if (!isCurrent())
        throw new Error(
          "Wallet session changed. Review the transaction again.",
        );
    };
    checkSession();
    if (!signer?.provider) throw new Error("Connect your browser wallet.");
    if ((await signer.getAddress()).toLowerCase() !== account.toLowerCase())
      throw new Error("Wallet account changed. Review the transaction again.");
    if (
      Number((await signer.provider.getNetwork()).chainId) !==
      this.config.chainId
    )
      throw new Error("Switch your wallet to the configured network.");
    const state = await this.read(account);
    validate(action, amount, state);
    if (action === "deposit" && state.allowance < amount) {
      const asset = new Contract(state.asset, tokenAbi, signer);
      progress("Approve this USDG amount in your wallet");
      await asset.approve.staticCall(this.config.vaultAddress, amount);
      checkSession();
      const tx = await asset.approve(this.config.vaultAddress, amount);
      progress("Waiting for USDG approval confirmation");
      await confirmed(tx);
    }
    // Approval and user review may take time: repeat limits, preview and simulation.
    progress("Refreshing the contract preview");
    await this.quote(action, amount, account);
    checkSession();
    const v = this.vault.connect(signer) as Contract;
    const method =
      action === "deposit"
        ? "deposit"
        : action === "redeem"
          ? "redeem"
          : "redeemInKind";
    const args =
      action === "deposit" ? [amount, account] : [amount, account, account];
    await v[method].staticCall(...args);
    checkSession();
    progress("Confirm the transaction in your wallet");
    const tx = await v[method](...args);
    progress("Transaction submitted · waiting for confirmation");
    return confirmed(tx);
  }
}

export class DemoAdapter implements VaultAdapter {
  mode = "demo" as const;
  total = 125000000000n;
  idle = 25000000000n;
  supply = 125000000000n;
  shares = 1250000000n;
  wallet = 10000000000n;
  cap = 250000000000n;
  paused = false;
  stale = false;
  baskets = Object.keys(names).map((symbol, i) => ({
    address: "0x" + String(i + 1).padStart(40, "0"),
    symbol,
    name: names[symbol],
    decimals: 18,
    balance: 20000n * 10n ** 18n,
    weight: 2000,
    value: 20000000000n,
    priceAt: Math.floor(Date.now() / 1000),
    stale: false,
  }));
  async read(account: string | null): Promise<Snapshot> {
    const shares = account ? this.shares : 0n;
    const position = this.supply ? (shares * this.total) / this.supply : 0n;
    return {
      mode: this.mode,
      account,
      asset: ZeroAddress,
      assetSymbol: "USDG",
      assetDecimals: 6,
      shareDecimals: 6,
      oracle: ZeroAddress,
      router: ZeroAddress,
      vault: ZeroAddress,
      chainId: 4663,
      block: 0,
      holdings: this.baskets.map((h) => ({
        ...h,
        value: this.stale ? null : h.value,
        stale: this.stale,
      })),
      nav: this.stale ? null : this.total,
      supply: this.supply,
      idle: this.idle,
      reserveBps: 2000,
      cap: this.cap,
      paused: this.paused,
      weightMode: 0,
      lastRebalance: 0,
      shares,
      walletAssets: account ? this.wallet : 0n,
      allowance: 0n,
      maxDeposit: this.paused
        ? 0n
        : this.stale
          ? null
          : this.cap > this.total
            ? this.cap - this.total
            : 0n,
      maxRedeem: this.stale
        ? null
        : this.total
          ? shares < (this.idle * this.supply) / this.total
            ? shares
            : (this.idle * this.supply) / this.total
          : 0n,
      maxWithdraw: this.stale
        ? null
        : position < this.idle
          ? position
          : this.idle,
      position: this.stale ? null : position,
      updatedAt: Math.floor(Date.now() / 1000),
    };
  }
  async quote(action: Action, amount: bigint, account: string): Promise<Quote> {
    validate(action, amount, await this.read(account));
    return {
      action,
      amount,
      output:
        action === "deposit"
          ? this.total
            ? (amount * this.supply) / this.total
            : amount
          : action === "redeem"
            ? (amount * this.total) / this.supply
            : (amount * this.idle) / this.supply,
      tokens:
        action === "inKind"
          ? this.baskets.map((h) => (h.balance * amount) / this.supply)
          : [],
    };
  }
  async execute(
    action: Action,
    amount: bigint,
    account: string,
    progress: (s: string) => void,
    _signer?: Signer,
    isCurrent: () => boolean = () => true,
  ) {
    const q = await this.quote(action, amount, account);
    progress("Simulating your transaction");
    await new Promise((r) => setTimeout(r, 700));
    if (!isCurrent())
      throw new Error("Wallet session changed. Review the transaction again.");
    if (action === "deposit") {
      this.total += amount;
      this.idle += amount;
      this.supply += q.output;
      this.shares += q.output;
      this.wallet -= amount;
    } else {
      const value = (amount * this.total) / this.supply;
      if (action === "inKind")
        this.baskets = this.baskets.map((h, i) => ({
          ...h,
          balance: h.balance - q.tokens[i],
          value: h.value - (h.value * amount) / this.supply,
        }));
      this.total -= action === "inKind" ? value : q.output;
      this.idle -= q.output;
      this.supply -= amount;
      this.shares -= amount;
      this.wallet += q.output;
    }
    return "demo";
  }
}
