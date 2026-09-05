import { ethers } from "ethers";
import { CHAIN_ID, TOKENS } from "voxelithic-interfaces";

export const API_BASE = "https://voxelithic.xyz/api/v1";
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function getJson(path, { fetchImpl = fetch, retries = 3 } = {}) {
  let lastError;
  for (let attempt = 0; attempt < retries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetchImpl(`${API_BASE}${path}`, {
        headers: { accept: "application/json" },
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`Voxelithic API ${response.status}: ${await response.text()}`);
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt + 1 < retries) await delay(500 * 2 ** attempt);
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError;
}

function assertCanonicalToken(actual, requested) {
  const expected = TOKENS[requested.toUpperCase()];
  if (!expected) return;
  if (actual.decimals !== expected.decimals || actual.address.toLowerCase() !== expected.address.toLowerCase()) {
    throw new Error(`Voxelithic returned non-canonical ${requested} metadata`);
  }
}

export async function getQuote(tokenIn, tokenOut, amountIn, options = {}) {
  if (!/^\d+(\.\d+)?$/.test(String(amountIn)) || Number(amountIn) <= 0) {
    throw new Error(`amountIn must be a positive decimal string, got ${amountIn}`);
  }
  const slippageBps = options.slippageBps ?? 100;
  if (!Number.isInteger(slippageBps) || slippageBps < 0 || slippageBps > 5_000) {
    throw new Error("slippageBps must be an integer from 0 to 5000");
  }
  const params = new URLSearchParams({ tokenIn, tokenOut, amountIn: String(amountIn), slippageBps: String(slippageBps) });
  const result = await getJson(`/quote?${params}`, options);
  if (result.chainId !== CHAIN_ID) throw new Error(`Unexpected Voxelithic chain ID ${result.chainId}`);
  assertCanonicalToken(result.tokenIn, tokenIn);
  assertCanonicalToken(result.tokenOut, tokenOut);
  if (!result.quote) throw new Error(`No ${tokenIn}/${tokenOut} quote: ${result.reason ?? "unknown reason"}`);
  for (const field of ["amountOutRaw", "minOutRaw"]) {
    if (!/^\d+$/.test(result.quote[field] ?? "")) throw new Error(`Invalid quote field ${field}`);
    if (BigInt(result.quote[field]) === 0n) throw new Error(`Zero quote field ${field}`);
  }
  if (!Number.isInteger(result.quote.priceImpactBps) || result.quote.priceImpactBps < 0) {
    throw new Error("Invalid quote priceImpactBps");
  }
  const maxPriceImpactBps = options.maxPriceImpactBps ?? 100;
  if (result.quote.priceImpactBps > maxPriceImpactBps) {
    throw new Error(`Price impact ${result.quote.priceImpactBps} bps exceeds limit ${maxPriceImpactBps} bps`);
  }
  return result;
}

export function toV3Hops(quoteResult) {
  const { quote } = quoteResult;
  if (quote.family !== "v3") {
    throw new Error(`Unsupported route family ${quote.family}; IndexVault v1 only accepts VoxRouter v3 hops`);
  }
  if (!Array.isArray(quote.route) || quote.route.length === 0) throw new Error("Empty v3 route");
  return quote.route.map((hop) => {
    if (!Number.isInteger(hop.kind) || hop.kind < 0 || hop.kind > 255) throw new Error("Invalid hop kind");
    if (!ethers.isAddress(hop.pool)) throw new Error("Invalid hop pool");
    if (typeof hop.zeroForOne !== "boolean") throw new Error("Invalid hop direction");
    if (!Number.isInteger(hop.feePpm) || hop.feePpm < 0 || hop.feePpm > 0xffffff) throw new Error("Invalid hop fee");
    return { kind: hop.kind, pool: ethers.getAddress(hop.pool), zeroForOne: hop.zeroForOne, feePpm: hop.feePpm };
  });
}

export async function checkV3RoundTrip(symbol, options = {}) {
  const [sell, buy] = await Promise.all([
    getQuote(symbol, "USDG", "0.01", options),
    getQuote("USDG", symbol, "1", options),
  ]);
  return {
    sellHops: toV3Hops(sell).length,
    buyHops: toV3Hops(buy).length,
  };
}

export async function getApiHealth(options = {}) {
  const result = await getJson("/health", options);
  if (result.chainId !== CHAIN_ID) throw new Error(`Unexpected Voxelithic chain ID ${result.chainId}`);
  return result;
}
