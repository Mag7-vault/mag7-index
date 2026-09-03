#!/usr/bin/env node
/**
 * post-prices.mjs
 *
 * Quotes each basket token against USDG using Voxelithic's live VoxQuoter,
 * then posts the results to PriceOracle.postPrices(). Run this on a cron
 * (e.g. every 10-15 min) — IndexVault.totalAssets() reverts once a price
 * is older than PriceOracle.maxStaleness (1h by default).
 *
 * ONE THING YOU MUST FILL IN BEFORE THIS RUNS: POOLS below. VoxQuoter prices
 * a specific pool (quoteExactIn(pool, zeroForOne, amountIn)), not a token
 * pair directly — Voxelithic doesn't expose pool discovery in the
 * voxelithic-interfaces npm package, only token/router/quoter addresses.
 * Get the pool address for each <TOKEN>/USDG pair from:
 *   - https://voxelithic.xyz/registry (their pool registry page), or
 *   - their HTTP API at https://voxelithic.xyz/api/v1 (documented as
 *     "no key, no signup" on their site — confirm the exact query shape
 *     yourself, it wasn't fully visible in what we could pull), or
 *   - their MCP server (`npx voxelithic-mcp`), which exposes a "quote a
 *     pair" tool that almost certainly does this pool lookup for you.
 *
 * WHY THIS SCRIPT EXISTS AT ALL: VoxQuoter.quoteExactIn is a revert-to-return
 * quoter — its own ABI declares `error QuoteResult(amountOut, amountPaid)`.
 * It is NOT safely callable inside a transaction (see src/interfaces/IVoxQuoter.sol).
 * ethers v6 will throw a decoded error for a custom error that's present in
 * the ABI you pass it, which is what we catch below.
 */

import "dotenv/config";
import { ethers } from "ethers";
import { VoxQuoterABI } from "voxelithic-interfaces";
import { TOKENS } from "voxelithic-interfaces";

const RPC_URL = process.env.ROBINHOOD_CHAIN_RPC;
const ORACLE_ADDRESS = process.env.PRICE_ORACLE_ADDRESS;
const KEEPER_PRIVATE_KEY = process.env.KEEPER_PRIVATE_KEY;
const VOX_QUOTER = "0x9616627E871c96e38cb21b9551F62Ed93366bE1B";

// Basket: token symbol -> pool address quoting <TOKEN>/USDG, plus which side
// of the pool USDG sits on (zeroForOne as seen FROM the token being priced).
// FILL THESE IN — see header comment above.
const POOLS = {
  NVDA:  { pool: "0x0000000000000000000000000000000000dEaD", zeroForOne: true },
  AAPL:  { pool: "0x0000000000000000000000000000000000dEaD", zeroForOne: true },
  TSLA:  { pool: "0x0000000000000000000000000000000000dEaD", zeroForOne: true },
  GOOGL: { pool: "0x0000000000000000000000000000000000dEaD", zeroForOne: true },
  META:  { pool: "0x0000000000000000000000000000000000dEaD", zeroForOne: true },
  AMZN:  { pool: "0x0000000000000000000000000000000000dEaD", zeroForOne: true },
};

const ORACLE_ABI = [
  "function postPrices(address[] tokens, uint256[] priceUsdg18) external",
];

async function quoteTokenInUsdg(quoter, pool, zeroForOne, amountIn1e18) {
  try {
    // eth_call, not a transaction. staticCall works even against a
    // nonpayable function precisely because we never broadcast it.
    const [amountOut] = await quoter.quoteExactIn.staticCall(pool, zeroForOne, amountIn1e18);
    return amountOut;
  } catch (err) {
    // Standard revert-to-return decode path: ethers v6 recognizes
    // QuoteResult from the ABI and surfaces it as err.revert.
    if (err.revert && err.revert.name === "QuoteResult") {
      return err.revert.args.amountOut;
    }
    throw err;
  }
}

async function main() {
  if (!RPC_URL || !ORACLE_ADDRESS || !KEEPER_PRIVATE_KEY) {
    throw new Error("Set ROBINHOOD_CHAIN_RPC, PRICE_ORACLE_ADDRESS, KEEPER_PRIVATE_KEY in .env");
  }

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(KEEPER_PRIVATE_KEY, provider);
  const quoter = new ethers.Contract(VOX_QUOTER, VoxQuoterABI, provider);
  const oracle = new ethers.Contract(ORACLE_ADDRESS, ORACLE_ABI, wallet);

  const tokens = [];
  const prices = [];

  for (const [symbol, { pool, zeroForOne }] of Object.entries(POOLS)) {
    const tokenMeta = TOKENS[symbol];
    if (!tokenMeta) {
      console.warn(`No token metadata for ${symbol}, skipping`);
      continue;
    }
    const oneToken = ethers.parseUnits("1", tokenMeta.decimals); // usually 1e18
    const amountOutUsdg = await quoteTokenInUsdg(quoter, pool, zeroForOne, oneToken);
    console.log(`${symbol}: 1 token = ${ethers.formatUnits(amountOutUsdg, 6)} USDG`);
    tokens.push(tokenMeta.address);
    prices.push(amountOutUsdg); // already USDG's native 6-decimal units
  }

  const tx = await oracle.postPrices(tokens, prices);
  console.log("postPrices tx:", tx.hash);
  await tx.wait();
  console.log("confirmed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
