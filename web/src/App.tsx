import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  Check,
  Copy,
  Menu,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import { Diagram } from "./Diagram";
import { Transaction } from "./Transaction";
import {
  articles,
  projectArticles,
  searchArticles,
  userArticles,
} from "./docs";
import { initialBasketPreview, percent, units } from "./model";
import { useVault, type VaultContext } from "./useVault";
function Holdings({ ctx }: { ctx: VaultContext }) {
  const s = ctx.snapshot;
  return (
    <section className="section">
      <div className="section-heading">
        <div>
          <span className="micro">01 / Portfolio composition</span>
          <h2>Five names. A considered balance.</h2>
        </div>
        <p>
          Equal targets within the invested basket.
          <br />
          Actual vault weights move with the market.
        </p>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              {[
                "Asset",
                "Basket target",
                "Actual vault weight",
                "Vault holding",
                "Value · USDG",
                "Oracle",
              ].map((t) => (
                <th key={t}>{t}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {s?.holdings.map((h, i) => (
              <tr key={h.address}>
                <td>
                  <span className="asset-number">0{i + 1}</span>
                  <strong>{h.symbol}</strong>
                  <small>{h.name}</small>
                </td>
                <td>
                  {h.weight === null ? "Unavailable" : h.weight / 100 + "%"}
                </td>
                <td>
                  {h.value === null || s.nav === null
                    ? "Unavailable"
                    : percent(h.value, s.nav).toFixed(2) + "%"}
                </td>
                <td>{units(h.balance, h.decimals, 4)}</td>
                <td>{units(h.value, s.assetDecimals)}</td>
                <td>
                  {ctx.adapter?.mode === "demo"
                    ? "Simulated"
                    : h.stale
                      ? "Stale / missing"
                      : "Fresh"}
                </td>
              </tr>
            ))}
            {s && (
              <tr className="reserve-row">
                <td>
                  <strong>{s.assetSymbol}</strong>
                  <small>Liquidity reserve</small>
                </td>
                <td>Separate reserve</td>
                <td>
                  {s.nav === null
                    ? "Unavailable"
                    : percent(s.idle, s.nav).toFixed(2) + "%"}
                </td>
                <td>{units(s.idle, s.assetDecimals)}</td>
                <td>{units(s.idle, s.assetDecimals)}</td>
                <td>Held idle</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {!s && <p>{ctx.error ? "Holdings unavailable." : "Loading holdings…"}</p>}
      <p className="table-note">
        20% of an 80% invested basket is approximately 16% of total vault value.
        The reserve minimum applies after rebalancing and can fall after
        withdrawals.
      </p>
    </section>
  );
}
function Mechanics() {
  return (
    <section className="section">
      <div className="section-heading">
        <div>
          <span className="micro">02 / How it works</span>
          <h2>
            Simple to hold.
            <br />
            Transparent by design.
          </h2>
        </div>
        <a className="inline-link" href="/docs/overview">
          Read the documentation <ArrowUpRight size={16} />
        </a>
      </div>
      <div className="steps">
        {[
          [
            "01",
            "Deposit USDG",
            "Connect your wallet, review an amount, and receive MAG7 vault shares. Your ownership is recorded on-chain.",
          ],
          [
            "02",
            "The vault allocates",
            "Keeper-posted prices inform valuation. Rebalancing trades through Voxelithic while retaining the required USDG reserve.",
          ],
          [
            "03",
            "Choose your exit",
            "Redeem for available USDG, or receive your proportional basket tokens through an in-kind exit.",
          ],
        ].map(([n, t, p]) => (
          <article key={n}>
            <span className="step-number">{n}</span>
            <h3>{t}</h3>
            <p>{p}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
function Exits() {
  return (
    <section className="section exit-section">
      <div>
        <span className="micro">03 / Know your exit</span>
        <h2>
          Liquidity matters.
          <br />
          So do your options.
        </h2>
        <p>
          The vault keeps a USDG buffer after rebalancing. When that buffer
          cannot cover your redemption, you can wait for keeper liquidity or
          take the underlying assets directly.
        </p>
        <a href="/docs/withdrawals" className="inline-link">
          Understand redemptions <ArrowUpRight size={16} />
        </a>
      </div>
      <div className="exit-options">
        <article>
          <span className="micro">Standard redemption</span>
          <h3>Receive USDG</h3>
          <p>
            Limited by your shares, available idle USDG, and valid oracle
            valuation.
          </p>
        </article>
        <article>
          <span className="micro">In-kind exit</span>
          <h3>Receive the basket</h3>
          <p>
            Your proportional USDG and stock tokens, without a fresh price
            dependency.
          </p>
        </article>
      </div>
    </section>
  );
}
function Address({
  address,
  label,
  ctx,
}: {
  address: string;
  label: string;
  ctx: VaultContext;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="address-row">
      <span>{label}</span>
      <code>
        {address.slice(0, 8)}…{address.slice(-6)}
      </code>
      <button
        className="icon-button"
        aria-label={`Copy ${label} address`}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(address);
            setCopied(true);
            setTimeout(() => setCopied(false), 1800);
          } catch {
            setCopied(false);
          }
        }}
      >
        {copied ? <Check size={14} /> : <Copy size={14} />}
      </button>
      {ctx.config?.explorerUrl && (
        <a
          aria-label={`View ${label} on explorer`}
          href={`${ctx.config.explorerUrl}/address/${address}`}
          target="_blank"
          rel="noreferrer"
        >
          <ArrowUpRight size={14} />
        </a>
      )}
    </div>
  );
}
function ContractAddressBar({ ctx }: { ctx: VaultContext }) {
  const [copied, setCopied] = useState(false);
  const config = ctx.config;
  if (!config || config.environment !== "mainnet") return null;
  const address = config.vaultAddress;
  return (
    <aside
      className="contract-address-bar"
      aria-label="Official MAG7 contract address"
    >
      <span className="micro">Official MAG7 CA</span>
      <code title={address}>{address}</code>
      <div className="contract-address-actions">
        <button
          className="icon-button"
          aria-label="Copy official MAG7 contract address"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(address);
              setCopied(true);
              setTimeout(() => setCopied(false), 1800);
            } catch {
              setCopied(false);
            }
          }}
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
        </button>
        {config.explorerUrl && (
          <a
            className="inline-link"
            href={`${config.explorerUrl}/address/${address}`}
            target="_blank"
            rel="noreferrer"
          >
            Explorer <ArrowUpRight size={13} />
          </a>
        )}
      </div>
    </aside>
  );
}
function Docs({ path }: { path: string }) {
  const [query, setQuery] = useState("");
  const slug = path.split("/")[2] || "overview";
  const a = articles.find((a) => a.slug === slug);
  const results = searchArticles(query);
  const showingTechnical = !!a && projectArticles.includes(a);
  const visibleResults = query.trim()
    ? results
    : showingTechnical
      ? projectArticles
      : userArticles;
  const visibleUserArticles = userArticles.filter((article) =>
    visibleResults.includes(article),
  );
  const visibleProjectArticles = projectArticles.filter((article) =>
    visibleResults.includes(article),
  );
  return (
    <div className="docs-layout">
      <aside className="docs-sidebar">
        <span className="micro">MAG7 / Documentation</span>
        <nav className="docs-audience-switch" aria-label="Documentation type">
          <a
            href="/docs/overview"
            aria-current={!showingTechnical ? "page" : undefined}
          >
            User guide
          </a>
          <a
            href="/docs/project-overview"
            aria-current={showingTechnical ? "page" : undefined}
          >
            Technical docs
          </a>
        </nav>
        <label className="search-field">
          <Search size={16} />
          <input
            placeholder="Search documentation"
            aria-label="Search documentation"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        {!!visibleUserArticles.length && (
          <div className="docs-nav-group">
            <span className="micro">Using MAG7</span>
            <nav aria-label="Using MAG7 articles">
              {visibleUserArticles.map((r) => (
                <a
                  key={r.slug}
                  href={`/docs/${r.slug}`}
                  aria-current={r.slug === slug ? "page" : undefined}
                >
                  {r.title}
                </a>
              ))}
            </nav>
          </div>
        )}
        {!!visibleProjectArticles.length && (
          <div
            className={`docs-nav-group${visibleUserArticles.length ? " docs-nav-technical" : ""}`}
          >
            <span className="micro">Technical reference</span>
            <nav aria-label="Technical reference articles">
              {visibleProjectArticles.map((r) => (
                <a
                  key={r.slug}
                  href={`/docs/${r.slug}`}
                  aria-current={r.slug === slug ? "page" : undefined}
                >
                  {r.title}
                </a>
              ))}
            </nav>
          </div>
        )}
        {!results.length && (
          <p>No matching articles. Try “withdraw” or “reserve”.</p>
        )}
      </aside>
      <article className="doc-article">
        {a ? (
          <>
            <span className="micro">
              Documentation / {String(articles.indexOf(a) + 1).padStart(2, "0")}
            </span>
            <h1>{a.title}</h1>
            <p className="doc-lead">{a.summary}</p>
            <nav className="toc" aria-label="On this page">
              <span className="micro">On this page</span>
              {a.sections.map((s) => (
                <a href={`#${s.id}`} key={s.id}>
                  {s.title}
                </a>
              ))}
            </nav>
            {a.sections.map((s) => (
              <section id={s.id} key={s.id}>
                <h2>
                  <a href={`#${s.id}`}>{s.title}</a>
                </h2>
                {s.body.map((p) => (
                  <p key={p}>{p}</p>
                ))}
                {s.blocks?.map((block, index) => {
                  if (block.type === "code")
                    return (
                      <div className="doc-code" key={`${s.id}-code-${index}`}>
                        {block.label && (
                          <span className="micro">{block.label}</span>
                        )}
                        <pre>
                          <code>{block.code}</code>
                        </pre>
                      </div>
                    );
                  if (block.type === "links")
                    return (
                      <div className="doc-links" key={`${s.id}-links-${index}`}>
                        {block.items.map((item) => (
                          <a
                            href={item.href}
                            target="_blank"
                            rel="noreferrer"
                            key={item.href}
                          >
                            <span>{item.label}</span>
                            {item.note && <small>{item.note}</small>}
                            <ArrowUpRight size={15} />
                          </a>
                        ))}
                      </div>
                    );
                  if (block.type === "table")
                    return (
                      <div
                        className="doc-table-wrap"
                        key={`${s.id}-table-${index}`}
                      >
                        <table>
                          <thead>
                            <tr>
                              {block.columns.map((column) => (
                                <th key={column}>{column}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {block.rows.map((row, rowIndex) => (
                              <tr key={`${s.id}-row-${rowIndex}`}>
                                {row.map((cell, cellIndex) => (
                                  <td
                                    key={`${s.id}-cell-${rowIndex}-${cellIndex}`}
                                  >
                                    {cell}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    );
                  return (
                    <aside className="doc-note" key={`${s.id}-note-${index}`}>
                      {block.label && (
                        <span className="micro">{block.label}</span>
                      )}
                      <p>{block.text}</p>
                    </aside>
                  );
                })}
              </section>
            ))}
            <a href="/vault" className="inline-link">
              Explore the vault <ArrowUpRight size={16} />
            </a>
          </>
        ) : (
          <>
            <h1>Article not found.</h1>
            <p>Use the guide navigation or search to find what you need.</p>
            <a href="/docs/overview">Return to the user guide</a>
          </>
        )}
      </article>
    </div>
  );
}
export function App() {
  const ctx = useVault();
  const [path, setPath] = useState(location.pathname),
    [menu, setMenu] = useState(false),
    [walletOpen, setWalletOpen] = useState(false);
  const walletDialog = useRef<HTMLDialogElement>(null);
  const [motion, setMotion] = useState(
    () =>
      !matchMedia("(prefers-reduced-motion: reduce)").matches &&
      localStorage.getItem("mag7-motion") !== "off",
  );
  useEffect(() => {
    const change = () => {
      setPath(location.pathname);
      setMenu(false);
      setWalletOpen(false);
    };
    const click = (e: MouseEvent) => {
      const a = (e.target as Element).closest("a");
      if (
        !a ||
        a.target ||
        e.metaKey ||
        e.ctrlKey ||
        e.shiftKey ||
        e.altKey ||
        e.button !== 0
      )
        return;
      const url = new URL(a.href);
      if (
        url.origin === location.origin &&
        url.pathname !== location.pathname
      ) {
        e.preventDefault();
        history.pushState(null, "", url);
        change();
        window.scrollTo(0, 0);
      }
    };
    window.addEventListener("popstate", change);
    document.addEventListener("click", click);
    return () => {
      window.removeEventListener("popstate", change);
      document.removeEventListener("click", click);
    };
  }, []);
  useEffect(() => {
    document.title = `MAG7 — ${path.startsWith("/docs") ? "Documentation" : path === "/vault" ? "Your vault" : "Index Infrastructure"}`;
    if (location.hash)
      document
        .getElementById(decodeURIComponent(location.hash.slice(1)))
        ?.scrollIntoView();
  }, [path]);
  useEffect(() => {
    const m = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => {
      if (m.matches) setMotion(false);
    };
    m.addEventListener("change", update);
    return () => m.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (walletOpen) walletDialog.current?.showModal();
    else walletDialog.current?.close();
  }, [walletOpen]);
  const s = ctx.snapshot,
    demo = ctx.adapter?.mode === "demo",
    connect = () => setWalletOpen(true);
  const toggle = () => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setMotion(false);
      return;
    }
    setMotion(!motion);
    localStorage.setItem("mag7-motion", motion ? "off" : "on");
  };
  return (
    <>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <header className="header">
        <a className="brand" href="/" aria-label="MAG7 Index Vault home">
          <img
            className="brand-logo"
            src="/brand/mag7-wordmark-white.png"
            alt="MAG7"
          />
          <span>Index infrastructure</span>
        </a>
        <nav className={menu ? "open" : ""} aria-label="Main navigation">
          {[
            ["/", "Overview"],
            ["/vault", "Vault"],
            ["/basket", "Basket"],
            ["/mechanics", "Mechanics"],
            ["/docs/overview", "Docs"],
          ].map(([url, label]) => (
            <a
              href={url}
              key={url}
              aria-current={
                path === url || (label === "Docs" && path.startsWith("/docs"))
                  ? "page"
                  : undefined
              }
            >
              {label}
            </a>
          ))}
        </nav>
        <button className="button wallet-button" onClick={connect}>
          {ctx.account
            ? `${ctx.account.slice(0, 6)}…${ctx.account.slice(-4)}`
            : "Connect wallet"}
        </button>
        <button
          className="icon-button mobile-menu"
          aria-label="Toggle menu"
          aria-expanded={menu}
          onClick={() => setMenu(!menu)}
        >
          {menu ? <X /> : <Menu />}
        </button>
      </header>
      <div className="environment">
        <span>
          <i className="status-dot" />
          {demo
            ? "Interactive demo · simulated balances"
            : ctx.config
              ? `${ctx.config.environment} · ${ctx.config.chainName}`
              : "Loading environment"}
        </span>
        <span>
          {demo ? "No real funds" : "Contract-connected interface"}{" "}
          <span className="desktop-only">
            {" "}
            /{" "}
            {s
              ? `Updated ${new Date(s.updatedAt * 1000).toLocaleTimeString()}`
              : "Awaiting data"}
          </span>
        </span>
      </div>
      <ContractAddressBar ctx={ctx} />
      {ctx.error && (
        <div className="error global-error" role="alert">
          {ctx.error}
          <button className="text-button" onClick={ctx.refresh}>
            Retry
          </button>
        </div>
      )}
      <main id="main">
        {path.startsWith("/docs") ? (
          <Docs path={path} />
        ) : (
          <>
            {path === "/" && (
              <>
                <div className="hero flow-only">
                  <h1 className="sr-only">MAG7 Index Vault</h1>
                  <div className="hero-flow">
                    <Diagram
                      holdings={s?.holdings ?? initialBasketPreview}
                      reserve={s?.reserveBps ?? 2000}
                      motion={motion}
                      onMotion={toggle}
                      syncing={!s && !ctx.error}
                    />
                    <aside className="execution">
                      <span className="micro">Execution layer</span>
                      <h3>VOX V3 ROUTER</h3>
                      <p>
                        Basket execution
                        <br />& rebalancing
                      </p>
                      <ShieldCheck
                        className="execution-icon"
                        strokeWidth={0.65}
                      />
                      <span className="micro">On-chain guardrails</span>
                      <ul>
                        <li>USDG reserve requirement</li>
                        <li>Configured basket weights</li>
                        <li>Slippage controls</li>
                        <li>Role-based access</li>
                      </ul>
                      <a className="inline-link" href="/docs/governance">
                        View controls <ArrowUpRight size={13} />
                      </a>
                    </aside>
                  </div>
                </div>
                <div className="content-wrap">
                  <Transaction ctx={ctx} onConnect={connect} compact />
                  <Holdings ctx={ctx} />
                  <Mechanics />
                  <Exits />
                </div>
              </>
            )}
            {path === "/vault" && (
              <div className="content-wrap">
                <div className="page-heading">
                  <span className="micro">MAG7 / Your position</span>
                  <h1>The vault, in your hands.</h1>
                  <p>
                    Review your balance, preview an amount, and choose your next
                    move.
                  </p>
                </div>
                <div className="metrics">
                  {[
                    [
                      "Your MAG7 shares",
                      units(s?.shares ?? null, s?.shareDecimals),
                    ],
                    [
                      "Position · USDG",
                      units(s?.position ?? null, s?.assetDecimals),
                    ],
                    [
                      "Available to withdraw · USDG",
                      units(s?.maxWithdraw ?? null, s?.assetDecimals),
                    ],
                    [
                      "Idle reserve · USDG",
                      units(s?.idle ?? null, s?.assetDecimals),
                    ],
                  ].map(([k, v]) => (
                    <div key={k}>
                      <span className="micro">{k}</span>
                      <strong>{v}</strong>
                    </div>
                  ))}
                </div>
                <Transaction ctx={ctx} onConnect={connect} />
                <section className="section">
                  <h2>Verify what you interact with.</h2>
                  {s?.mode === "contract" ? (
                    <div className="address-list">
                      {[
                        ["Vault", s.vault],
                        ["USDG asset", s.asset],
                        ["Price oracle", s.oracle],
                        ["Router", s.router],
                      ].map(([label, address]) => (
                        <Address
                          key={label}
                          label={label}
                          address={address}
                          ctx={ctx}
                        />
                      ))}
                    </div>
                  ) : (
                    <p>
                      Demo mode uses simulated positions. Contract addresses
                      appear when a deployment is configured.
                    </p>
                  )}
                  <a href="/docs/governance" className="inline-link">
                    Governance & status <ArrowUpRight size={15} />
                  </a>
                </section>
                <Exits />
              </div>
            )}
            {path === "/basket" && (
              <div className="content-wrap">
                <div className="page-heading">
                  <span className="micro">MAG7 / The basket</span>
                  <h1>Know every allocation.</h1>
                  <p>
                    Target weights, actual holdings, and the liquidity behind
                    your shares.
                  </p>
                </div>
                <Holdings ctx={ctx} />
                <section className="section">
                  <h2>Price freshness is visible.</h2>
                  <p>
                    {s?.nav === null
                      ? "Valuation is currently unavailable. Raw holdings are still shown."
                      : "The displayed value is based on the configured oracle snapshot."}{" "}
                    {demo
                      ? "All prices in this environment are simulated."
                      : "Required stale prices invalidate NAV; they are never silently treated as current."}
                  </p>
                  <a href="/docs/valuation" className="inline-link">
                    Understand NAV <ArrowUpRight size={15} />
                  </a>
                </section>
              </div>
            )}
            {path === "/mechanics" && (
              <div className="content-wrap">
                <div className="page-heading">
                  <span className="micro">MAG7 / Mechanics</span>
                  <h1>A clear path through the vault.</h1>
                  <p>
                    Share accounting, allocation, and liquidity—explained step
                    by step.
                  </p>
                </div>
                <Mechanics />
                <Exits />
                <section className="section">
                  <h2>Prices inform. Keepers execute.</h2>
                  <p>
                    The price keeper posts quotes to the oracle. A separate
                    rebalance keeper trades through the router. Depositing and
                    rebalancing are distinct actions, and the reserve is checked
                    after rebalancing.
                  </p>
                  <a className="inline-link" href="/docs/valuation">
                    Read about valuation <ArrowUpRight size={15} />
                  </a>
                </section>
              </div>
            )}
            {!["/", "/vault", "/basket", "/mechanics"].includes(path) && (
              <div className="page-heading content-wrap">
                <h1>Page not found.</h1>
                <a href="/">Return to MAG7</a>
              </div>
            )}
            <section className="docs-callout content-wrap">
              <div>
                <span className="micro">Understand before you deposit</span>
                <h2>Everything you need to know.</h2>
              </div>
              <a href="/docs/overview" className="button">
                Explore the user guide <ArrowUpRight size={16} />
              </a>
            </section>
          </>
        )}
      </main>
      <footer className="footer">
        <span>© {new Date().getFullYear()} MAG7 Index Vault</span>
        <nav>
          <a href="/docs/overview">Docs</a>
          <a href="/docs/risks">Risk disclosure</a>
          <a href="/docs/governance#privacy">Privacy</a>
          <a
            className="footer-social"
            href="https://x.com/mag7vault"
            target="_blank"
            rel="noreferrer"
            aria-label="Follow MAG7 Vault on X"
            title="MAG7 Vault on X"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
          </a>
        </nav>
        <span className="micro">
          <i className="status-dot" />
          {demo
            ? "Demo · no real funds"
            : ctx.config?.chainName || "Pre-production"}
        </span>
      </footer>
      <dialog
        ref={walletDialog}
        className="wallet-dialog"
        onCancel={() => setWalletOpen(false)}
        onClick={(e) => {
          if (e.target === e.currentTarget) setWalletOpen(false);
        }}
      >
        <div className="dialog-heading">
          <span className="micro">
            {ctx.account ? "Your connection" : "Connect to MAG7"}
          </span>
          <button
            className="icon-button"
            aria-label="Close wallet dialog"
            onClick={() => setWalletOpen(false)}
          >
            <X size={18} />
          </button>
        </div>
        <h2>{demo ? "Explore the vault." : "Choose your wallet."}</h2>
        <p>
          {demo
            ? "The demo wallet starts with simulated USDG and MAG7 shares. No browser wallet is needed."
            : "Connecting shares your public address. It does not approve spending."}
        </p>
        {ctx.account ? (
          <>
            <code className="full-address">{ctx.account}</code>
            {ctx.accounts.length > 1 && (
              <label>
                Connected account
                <select
                  aria-label="Connected account"
                  value={ctx.account}
                  onChange={(e) => ctx.selectAccount(e.target.value)}
                >
                  {ctx.accounts.map((address) => (
                    <option key={address} value={address}>
                      {address}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <button
              className="button"
              onClick={() => {
                ctx.disconnect();
                setWalletOpen(false);
              }}
            >
              Disconnect
            </button>
          </>
        ) : demo ? (
          <button
            className="button primary"
            onClick={async () => {
              await ctx.connect();
              setWalletOpen(false);
            }}
          >
            Connect demo wallet <ArrowUpRight size={16} />
          </button>
        ) : ctx.wallets.length ? (
          ctx.wallets.map((w) => (
            <button
              className="button wallet-option"
              key={w.id}
              onClick={async () => {
                await ctx.connect(w);
                setWalletOpen(false);
              }}
            >
              {w.name}
              <ArrowUpRight size={16} />
            </button>
          ))
        ) : (
          <p className="notice">
            No browser wallet detected. Open this site in a browser with a
            compatible wallet installed.
          </p>
        )}
      </dialog>
    </>
  );
}
