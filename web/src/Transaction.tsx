import { useEffect, useRef, useState } from "react";
import { formatUnits } from "ethers";
import { ArrowUpRight, Check, Wallet } from "lucide-react";
import {
  amountFromInput,
  friendlyError,
  units,
  validate,
  type Action,
  type Quote,
} from "./model";
import type { VaultContext } from "./useVault";
import { VaultStatus } from "./VaultStatus";
export function Transaction({
  ctx,
  onConnect,
  compact = false,
}: {
  ctx: VaultContext;
  onConnect: () => void;
  compact?: boolean;
}) {
  const [action, setAction] = useState<Action>("deposit"),
    [input, setInput] = useState(""),
    [quote, setQuote] = useState<Quote | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [progress, setProgress] = useState(""),
    [success, setSuccess] = useState("");
  const epoch = useRef(0);
  const s = ctx.snapshot;
  useEffect(() => {
    epoch.current++;
    setQuote(null);
    setError("");
  }, [input, action, ctx.account, ctx.wrongChain, ctx.adapter]);
  useEffect(() => {
    setSuccess("");
  }, [action, ctx.account, ctx.wrongChain]);
  useEffect(
    () => () => {
      epoch.current++;
    },
    [],
  );
  async function review() {
    if (!ctx.account) {
      onConnect();
      return;
    }
    if (!s || !ctx.adapter) return;
    const key = ++epoch.current;
    setBusy(true);
    setError("");
    try {
      const amount = amountFromInput(
        input,
        action === "deposit" ? s.assetDecimals : s.shareDecimals,
      );
      const q = await ctx.adapter.quote(action, amount, ctx.account);
      if (key === epoch.current) setQuote(q);
    } catch (e) {
      if (key === epoch.current) setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }
  async function submit() {
    if (!s || !ctx.adapter || !ctx.account) return;
    const key = ++epoch.current;
    const sessionCurrent = ctx.captureSession();
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const amount =
        quote?.action === action
          ? quote.amount
          : amountFromInput(
              input,
              action === "deposit" ? s.assetDecimals : s.shareDecimals,
            );
      validate(action, amount, s);
      const hash = await ctx.adapter.execute(
        action,
        amount,
        ctx.account,
        (m) => key === epoch.current && setProgress(m),
        await ctx.signer(),
        () => sessionCurrent() && key === epoch.current,
        s,
      );
      if (key === epoch.current) {
        setSuccess(hash);
        setQuote(null);
        setInput("");
      }
      await ctx.refresh();
    } catch (e) {
      if (key === epoch.current) setError(friendlyError(e));
    } finally {
      setBusy(false);
      setProgress("");
    }
  }
  const max = s
    ? action === "deposit"
      ? s.walletAssets < (s.maxDeposit ?? 0n)
        ? s.walletAssets
        : (s.maxDeposit ?? 0n)
      : action === "redeem"
        ? (s.maxRedeem ?? 0n)
        : s.shares
    : 0n;
  return (
    <section
      className={`transaction ${compact ? "compact" : ""}`}
      aria-label="Vault transactions"
    >
      <div className="transaction-intro">
        <span className="micro">
          {compact ? "Your next position" : "Transact with the vault"}
        </span>
        <h2>{compact ? "One deposit.\nOne position." : "Make your move."}</h2>
        <p>
          {ctx.adapter?.mode === "demo"
            ? "Explore with simulated funds. No real wallet or money required."
            : "Enter an amount, then approve the transaction in your wallet."}
        </p>
        {compact && (
          <a className="inline-link" href="/vault">
            Open vault <ArrowUpRight size={14} />
          </a>
        )}
      </div>
      <div className="transaction-main">
        <div className="tabs" role="tablist" aria-label="Transaction type">
          {(["deposit", "redeem", "inKind"] as Action[]).map((a, i) => (
            <button
              role="tab"
              aria-selected={action === a}
              tabIndex={action === a ? 0 : -1}
              disabled={busy}
              key={a}
              onClick={() => setAction(a)}
              onKeyDown={(e) => {
                if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(e.key))
                  return;
                e.preventDefault();
                const index =
                  e.key === "Home"
                    ? 0
                    : e.key === "End"
                      ? 2
                      : (i + (e.key === "ArrowRight" ? 1 : 2)) % 3;
                setAction((["deposit", "redeem", "inKind"] as Action[])[index]);
                (
                  e.currentTarget.parentElement?.children[index] as HTMLElement
                )?.focus();
              }}
            >
              {a === "deposit"
                ? "Deposit"
                : a === "redeem"
                  ? "Redeem USDG"
                  : "In-kind Exit"}
            </button>
          ))}
        </div>
        <div className="transaction-fields">
          <div className="amount-field">
            <label
              htmlFor={compact ? "hero-amount" : "vault-amount"}
              className="micro"
            >
              {action === "deposit"
                ? "Deposit amount"
                : "MAG7 shares to redeem"}
            </label>
            <div className="amount-control">
              <span className="currency-mark">
                {action === "deposit" ? "$" : "M"}
              </span>
              <input
                id={compact ? "hero-amount" : "vault-amount"}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="0.00"
                inputMode="decimal"
                autoComplete="off"
                disabled={busy}
              />
              <span>
                {action === "deposit" ? s?.assetSymbol || "USDG" : "MAG7"}
              </span>
              <button
                className="text-button micro"
                disabled={!s || busy || !ctx.account}
                onClick={() =>
                  setInput(
                    formatUnits(
                      max,
                      action === "deposit"
                        ? s!.assetDecimals
                        : s!.shareDecimals,
                    ),
                  )
                }
              >
                Max
              </button>
            </div>
            <small>
              {action === "deposit" ? "Wallet balance: " : "Available: "}
              {units(
                action === "deposit" ? (s?.walletAssets ?? null) : max,
                action === "deposit" ? s?.assetDecimals : s?.shareDecimals,
              )}{" "}
              {action === "deposit" ? "USDG" : "MAG7"}
            </small>
            {action === "deposit" && (
              <small>
                Deposit limit: {units(s?.maxDeposit ?? null, s?.assetDecimals)}{" "}
                USDG
                {s?.nav === null && " — waiting for fresh oracle prices."}
              </small>
            )}
          </div>
          <div className="estimate">
            <span className="micro">
              {action === "deposit"
                ? "Estimated MAG7 shares"
                : action === "redeem"
                  ? "Estimated USDG"
                  : "USDG + basket tokens"}
            </span>
            <strong>
              {quote
                ? units(
                    quote.output,
                    action === "deposit" ? s?.shareDecimals : s?.assetDecimals,
                  )
                : "—"}
            </strong>
            <small>
              {action === "inKind"
                ? "Assets returned directly"
                : "Contract preview · not a guaranteed output"}
            </small>
          </div>
        </div>
        {quote?.action === "inKind" && (
          <ul className="token-preview">
            {s?.holdings.map((h, i) => (
              <li key={h.address}>
                {h.symbol}
                <span>{units(quote.tokens[i], h.decimals, 6)}</span>
              </li>
            ))}
          </ul>
        )}
        {action === "inKind" && (
          <p className="notice">
            You receive underlying tokens, not a USDG-only payout. No automatic
            sale is performed.
          </p>
        )}
        {action === "deposit" && ctx.adapter?.mode === "contract" && (
          <p className="notice">
            Your first deposit may require a one-time USDG approval. Later
            deposits use the existing allowance.
          </p>
        )}
        {s?.paused && (
          <p className="notice">
            Deposits are paused. Available exit paths remain accessible.
          </p>
        )}
        {ctx.wrongChain ? (
          <button className="button primary" onClick={ctx.switchNetwork}>
            Switch network
          </button>
        ) : (
          <button
            className="button primary"
            disabled={busy || (!s && !!ctx.account)}
            onClick={action === "inKind" && !quote ? review : submit}
          >
            {busy
              ? progress || "Preparing wallet confirmation…"
              : action === "inKind" && quote
                ? ctx.adapter?.mode === "demo"
                  ? "Confirm demo transaction"
                  : "Confirm in wallet"
                : ctx.account
                  ? action === "deposit"
                    ? "Deposit USDG"
                    : action === "redeem"
                      ? "Redeem USDG"
                      : "Review in-kind exit"
                  : ctx.adapter?.mode === "demo"
                    ? "Try demo wallet"
                    : "Connect wallet"}
            {!busy &&
              (action === "inKind" && quote ? (
                <Check size={16} />
              ) : (
                <Wallet size={16} />
              ))}
          </button>
        )}
        {quote && (
          <p className="notice">
            {ctx.adapter?.mode === "demo"
              ? "Simulation only."
              : "Final output may change; this contract method has no minimum-output parameter."}
          </p>
        )}
        <div aria-live="polite">
          {error && <p className="error">{error}</p>}
          {success && (
            <p className="success">
              {success === "demo"
                ? "Demo transaction completed."
                : "Transaction confirmed."}
              {success !== "demo" && ctx.config?.explorerUrl && (
                <a
                  href={`${ctx.config.explorerUrl}/tx/${success}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {" "}
                  View transaction
                </a>
              )}
            </p>
          )}
        </div>
        {!compact && <VaultStatus ctx={ctx} />}
      </div>
    </section>
  );
}
