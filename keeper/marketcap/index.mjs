import "dotenv/config";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// Pluggable market-cap source with a fallback chain, feeding IndexVault's
// optional MARKET_CAP weighting. The values posted on-chain are an abstract,
// self-consistent unit — only ratios between tokens matter (IndexVault
// normalizes them into capped weights), so the exact unit a provider returns is
// irrelevant as long as it is consistent within a single post.
//
// Providers (MARKETCAP_PROVIDER):
//   static | equal  → equal sentinel for every name (⇒ equal weights). Safe default.
//   http            → GET MARKETCAP_API_BASE?symbols=... (Bearer MARKETCAP_API_KEY)
//   module          → import MARKETCAP_MODULE, call its fetchMarketCaps(symbols)
//
// Fallback chain when the primary provider fails: last-known snapshot on disk,
// then the equal sentinel. The keeper therefore never blocks a rebalance just
// because an external data API is down; it degrades to the last good data or to
// equal weights, and alerts (see post-market-caps.mjs).

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_SNAPSHOT = join(HERE, "marketcap.snapshot.json");
const EQUAL_SENTINEL = "1000000000000"; // 1e12, identical across names ⇒ equal weights

function defaultReadSnapshot(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function defaultWriteSnapshot(path, data) {
  try {
    writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
  } catch {
    /* best-effort persistence; never fatal */
  }
}

export function equalWeightCaps(symbols) {
  const caps = {};
  for (const symbol of symbols) caps[symbol] = EQUAL_SENTINEL;
  return caps;
}

// Accepts { data: { SYM: { marketCap } } }, { SYM: { marketCap } }, or { SYM: number }.
export function normalizeCaps(symbols, body) {
  const src = body?.data ?? body ?? {};
  const caps = {};
  for (const symbol of symbols) {
    const entry = src[symbol];
    const raw = entry && typeof entry === "object" ? entry.marketCap : entry;
    if (raw === undefined || raw === null) throw new Error(`No market cap for ${symbol}`);
    const numeric = Number(raw);
    if (!Number.isFinite(numeric) || numeric <= 0) throw new Error(`Non-positive market cap for ${symbol}`);
    caps[symbol] = BigInt(Math.trunc(numeric)).toString();
  }
  return caps;
}

async function fetchFromHttp(symbols, { apiBase, apiKey, fetchImpl }) {
  if (!apiBase) throw new Error("MARKETCAP_API_BASE is not set");
  const url = new URL(apiBase);
  url.searchParams.set("symbols", symbols.join(","));
  const headers = { accept: "application/json" };
  if (apiKey) headers.authorization = `Bearer ${apiKey}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetchImpl(url.toString(), { headers, signal: controller.signal });
    if (!response.ok) throw new Error(`market-cap API ${response.status}`);
    return normalizeCaps(symbols, await response.json());
  } finally {
    clearTimeout(timeout);
  }
}

function pick(source, keys) {
  const out = {};
  for (const key of keys) out[key] = source[key];
  return out;
}

export async function fetchMarketCaps(symbols, options = {}) {
  const provider = (options.provider ?? process.env.MARKETCAP_PROVIDER ?? "static").toLowerCase();
  const fetchImpl = options.fetchImpl ?? fetch;
  const snapshotPath = options.snapshotPath ?? process.env.MARKETCAP_SNAPSHOT ?? DEFAULT_SNAPSHOT;
  const readSnapshot = options.readSnapshot ?? defaultReadSnapshot;
  const writeSnapshot = options.writeSnapshot ?? defaultWriteSnapshot;

  if (provider === "static" || provider === "equal") {
    return { source: "equal", unit: "sentinel", caps: equalWeightCaps(symbols) };
  }

  let primaryError;
  try {
    let caps;
    if (provider === "http") {
      caps = await fetchFromHttp(symbols, {
        apiBase: options.apiBase ?? process.env.MARKETCAP_API_BASE,
        apiKey: options.apiKey ?? process.env.MARKETCAP_API_KEY,
        fetchImpl,
      });
    } else if (provider === "module") {
      const modulePath = options.modulePath ?? process.env.MARKETCAP_MODULE;
      if (!modulePath) throw new Error("MARKETCAP_PROVIDER=module requires MARKETCAP_MODULE");
      const mod = await import(modulePath);
      if (typeof mod.fetchMarketCaps !== "function") throw new Error(`${modulePath} must export fetchMarketCaps`);
      caps = normalizeCaps(symbols, await mod.fetchMarketCaps(symbols));
    } else {
      throw new Error(`Unknown MARKETCAP_PROVIDER ${provider}`);
    }
    writeSnapshot(snapshotPath, { observedAt: new Date().toISOString(), caps });
    return { source: provider, unit: "provider", caps };
  } catch (error) {
    primaryError = error;
  }

  const reason = primaryError.message ?? String(primaryError);
  const snapshot = readSnapshot(snapshotPath);
  if (snapshot?.caps && symbols.every((symbol) => snapshot.caps[symbol])) {
    return { source: "snapshot", unit: "provider", caps: pick(snapshot.caps, symbols), staleReason: reason };
  }
  return { source: "equal-fallback", unit: "sentinel", caps: equalWeightCaps(symbols), staleReason: reason };
}
