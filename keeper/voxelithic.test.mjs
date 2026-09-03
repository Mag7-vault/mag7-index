import test from "node:test";
import assert from "node:assert/strict";
import { TOKENS } from "voxelithic-interfaces";
import { getQuote, toV3Hops } from "./voxelithic.mjs";

const response = (body) => ({ ok: true, json: async () => body });
const baseResult = {
  chainId: 4663,
  tokenIn: TOKENS.NVDA,
  tokenOut: TOKENS.USDG,
  quote: { amountOutRaw: "229000000", minOutRaw: "226710000", priceImpactBps: 1, family: "v3", route: [{ kind: 1, pool: "0xd4eb21209c4d6093f80b5b84f5c45cc093ea14a3", zeroForOne: false, feePpm: 0 }] },
};

test("validates and converts a v3 quote", async () => {
  const result = await getQuote("NVDA", "USDG", "1", { fetchImpl: async () => response(baseResult) });
  assert.deepEqual(toV3Hops(result), [{ kind: 1, pool: "0xd4EB21209C4D6093f80B5b84f5C45cc093EA14a3", zeroForOne: false, feePpm: 0 }]);
});

test("rejects unsupported v4 routes", () => {
  assert.throws(() => toV3Hops({ quote: { family: "v4", route: [{}] } }), /only accepts VoxRouter v3/);
});

test("rejects excessive price impact", async () => {
  const body = structuredClone(baseResult);
  body.quote.priceImpactBps = 101;
  await assert.rejects(() => getQuote("NVDA", "USDG", "1", { fetchImpl: async () => response(body) }), /exceeds limit/);
});

test("rejects a token-address mismatch", async () => {
  const body = structuredClone(baseResult);
  body.tokenIn.address = TOKENS.AAPL.address;
  await assert.rejects(() => getQuote("NVDA", "USDG", "1", { fetchImpl: async () => response(body) }), /non-canonical/);
});
