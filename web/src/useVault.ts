import { useCallback, useEffect, useRef, useState } from "react";
import { BrowserProvider, type Eip1193Provider } from "ethers";
import { ContractAdapter, DemoAdapter } from "./adapters";
import {
  demoAccount,
  friendlyError,
  parseDeployment,
  type Deployment,
  type Snapshot,
  type VaultAdapter,
} from "./model";
export type Injected = Eip1193Provider & {
  on?: (name: string, listener: (data: unknown) => void) => void;
  removeListener?: (name: string, listener: (data: unknown) => void) => void;
  isMetaMask?: boolean;
  isCoinbaseWallet?: boolean;
};
export type WalletOption = { id: string; name: string; provider: Injected };
export function useVault() {
  const [adapter, setAdapter] = useState<VaultAdapter | null>(null),
    [config, setConfig] = useState<Deployment | null>(null),
    [snapshot, setSnapshot] = useState<Snapshot | null>(null),
    [error, setError] = useState(""),
    [account, setAccount] = useState<string | null>(null),
    [accounts, setAccounts] = useState<string[]>([]),
    [provider, setProvider] = useState<Injected | null>(null),
    [wallets, setWallets] = useState<WalletOption[]>([]),
    [chain, setChain] = useState<number | null>(null);
  const version = useRef(0);
  const session = useRef(0);
  useEffect(() => {
    let live = true;
    fetch("/deployment.json", { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok)
          throw new Error("Could not load public deployment configuration.");
        return r.json();
      })
      .then((raw) => {
        const c = parseDeployment(raw);
        if (live) {
          setConfig(c);
          setAdapter(c ? new ContractAdapter(c) : new DemoAdapter());
        }
      })
      .catch((e) => live && setError(friendlyError(e)));
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    function announce(event: Event) {
      const d = (event as CustomEvent).detail;
      if (d?.provider && d?.info?.uuid)
        setWallets((old) =>
          old.some((w) => w.id === d.info.uuid)
            ? old
            : [
                ...old,
                { id: d.info.uuid, name: d.info.name, provider: d.provider },
              ],
        );
    }
    window.addEventListener("eip6963:announceProvider", announce);
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    const fallback = (window as Window & { ethereum?: Injected }).ethereum;
    if (fallback)
      setWallets((old) =>
        old.some((w) => w.provider === fallback)
          ? old
          : [
              ...old,
              {
                id: "injected",
                name: fallback.isMetaMask
                  ? "MetaMask"
                  : fallback.isCoinbaseWallet
                    ? "Coinbase Wallet"
                    : "Browser wallet",
                provider: fallback,
              },
            ],
      );
    return () =>
      window.removeEventListener("eip6963:announceProvider", announce);
  }, []);
  const refresh = useCallback(async () => {
    if (!adapter) return;
    const ticket = ++version.current;
    try {
      const data = await adapter.read(account);
      if (ticket === version.current) {
        setSnapshot(data);
        setError("");
      }
    } catch (e) {
      if (ticket === version.current) {
        setError(friendlyError(e));
      }
    }
  }, [adapter, account, chain]);
  useEffect(() => {
    setSnapshot(null);
    void refresh();
    const timer = setInterval(() => {
      if (!document.hidden) void refresh();
    }, 15000);
    const visible = () => {
      if (!document.hidden) void refresh();
    };
    document.addEventListener("visibilitychange", visible);
    return () => {
      version.current++;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [refresh]);
  useEffect(() => {
    if (!provider) return;
    const accounts = (data: unknown) => {
      session.current++;
      version.current++;
      setSnapshot(null);
      const next = Array.isArray(data)
        ? data.filter((a): a is string => typeof a === "string")
        : [];
      setAccounts(next);
      setAccount(next[0] || null);
    };
    const changed = (data: unknown) => {
      session.current++;
      version.current++;
      setSnapshot(null);
      setChain(Number(data));
    };
    provider.on?.("accountsChanged", accounts);
    provider.on?.("chainChanged", changed);
    return () => {
      provider.removeListener?.("accountsChanged", accounts);
      provider.removeListener?.("chainChanged", changed);
    };
  }, [provider]);
  async function connect(wallet?: WalletOption) {
    session.current++;
    setError("");
    try {
      if (adapter?.mode === "demo") {
        setAccounts([demoAccount]);
        setAccount(demoAccount);
        return;
      }
      if (!wallet) throw new Error("Choose an installed browser wallet.");
      const accounts = (await wallet.provider.request({
        method: "eth_requestAccounts",
      })) as string[];
      const network = await wallet.provider.request({ method: "eth_chainId" });
      setProvider(wallet.provider);
      setAccounts(accounts);
      setAccount(accounts[0] || null);
      setChain(Number(network));
    } catch (e) {
      setError(friendlyError(e));
    }
  }
  async function switchNetwork() {
    if (!provider || !config) return;
    try {
      await provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: "0x" + config.chainId.toString(16) }],
      });
    } catch (e) {
      if ((e as { code?: number }).code === 4902) {
        try {
          await provider.request({
            method: "wallet_addEthereumChain",
            params: [
              {
                chainId: "0x" + config.chainId.toString(16),
                chainName: config.chainName,
                rpcUrls: [config.rpcUrl],
                nativeCurrency: config.nativeCurrency,
                ...(config.explorerUrl
                  ? { blockExplorerUrls: [config.explorerUrl] }
                  : {}),
              },
            ],
          });
        } catch (err) {
          setError(friendlyError(err));
        }
      } else setError(friendlyError(e));
    }
  }
  function disconnect() {
    session.current++;
    version.current++;
    setSnapshot(null);
    setProvider(null);
    setAccount(null);
    setAccounts([]);
    setChain(null);
  }
  return {
    adapter,
    config,
    snapshot,
    error,
    account,
    accounts,
    selectAccount: (next: string) => {
      if (!accounts.includes(next)) return;
      session.current++;
      version.current++;
      setSnapshot(null);
      setAccount(next);
    },
    wallets,
    connect,
    disconnect,
    refresh,
    switchNetwork,
    captureSession: () => {
      const id = session.current;
      return () => id === session.current;
    },
    wrongChain: !!account && !!config && chain !== config.chainId,
    signer: async () =>
      provider && account
        ? new BrowserProvider(provider).getSigner(account)
        : undefined,
  };
}
export type VaultContext = ReturnType<typeof useVault>;
