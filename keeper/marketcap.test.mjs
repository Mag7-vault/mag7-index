import test from "node:test";
import assert from "node:assert/strict";
import { fetchMarketCaps, normalizeCaps, equalWeightCaps } from "./marketcap/index.mjs";

const SYMBOLS = ["NVDA", "AAPL", "TSLA"];
const noopWrite = () => {};
const noSnapshot = () => null;

test("static provider yields equal sentinel caps", async () => {
  const result = await fetchMarketCaps(SYMBOLS, { provider: "static" });
  assert.equal(result.source, "equal");
  const values = new Set(Object.values(result.caps));
  assert.equal(values.size, 1); // all identical ⇒ equal weights on-chain
});

test("normalizeCaps floors to positive integer strings and rejects junk", () => {
  const caps = normalizeCaps(["NVDA"], { NVDA: { marketCap: 3.2e12 } });
  assert.equal(caps.NVDA, "3200000000000");
  assert.throws(() => normalizeCaps(["NVDA"], { NVDA: 0 }), /Non-positive/);
  assert.throws(() => normalizeCaps(["NVDA"], {}), /No market cap/);
});

test("http provider parses a provider response", async () => {
  const body = { data: { NVDA: { marketCap: 3e12 }, AAPL: { marketCap: 3e12 }, TSLA: { marketCap: 1e12 } } };
  const fetchImpl = async () => ({ ok: true, json: async () => body });
  const result = await fetchMarketCaps(SYMBOLS, {
    provider: "http",
    apiBase: "https://example.com/mcap",
    fetchImpl,
    writeSnapshot: noopWrite,
  });
  assert.equal(result.source, "http");
  assert.equal(result.caps.NVDA, "3000000000000");
  assert.equal(result.caps.TSLA, "1000000000000");
});

test("falls back to the last-known snapshot when the API fails", async () => {
  const fetchImpl = async () => {
    throw new Error("503 upstream");
  };
  const snapshot = { caps: { NVDA: "9", AAPL: "8", TSLA: "7" } };
  const result = await fetchMarketCaps(SYMBOLS, {
    provider: "http",
    apiBase: "https://example.com/mcap",
    fetchImpl,
    readSnapshot: () => snapshot,
    writeSnapshot: noopWrite,
  });
  assert.equal(result.source, "snapshot");
  assert.equal(result.caps.NVDA, "9");
  assert.match(result.staleReason, /503/);
});

test("falls back to equal weights when API fails and no snapshot exists", async () => {
  const fetchImpl = async () => {
    throw new Error("timeout");
  };
  const result = await fetchMarketCaps(SYMBOLS, {
    provider: "http",
    apiBase: "https://example.com/mcap",
    fetchImpl,
    readSnapshot: noSnapshot,
    writeSnapshot: noopWrite,
  });
  assert.equal(result.source, "equal-fallback");
  assert.deepEqual(result.caps, equalWeightCaps(SYMBOLS));
  assert.match(result.staleReason, /timeout/);
});
