#!/usr/bin/env node
import "dotenv/config";
import { ethers } from "ethers";
import { CHAIN_ID, TOKENS } from "voxelithic-interfaces";
import { fetchMarketCaps } from "./marketcap/index.mjs";
import { getSigner } from "./signer.mjs";
import { sendAlert } from "./notify.mjs";

// Posts per-token market caps to PriceOracle for IndexVault's MARKET_CAP
// weighting mode. Dry-run by default; --execute sends the transaction. Only
// needed once the vault is switched to MARKET_CAP mode; harmless before then.

const ORACLE_ABI = ["function postMarketCaps(address[] tokens,uint256[] caps) external"];
const DEFAULT_BASKET = ["NVDA", "AAPL", "TSLA", "GOOGL", "AMZN"];

async function main() {
  const execute = process.argv.includes("--execute");
  const rpcUrl = process.env.ROBINHOOD_MAINNET_RPC;
  const oracleAddress = process.env.PRICE_ORACLE_ADDRESS;
  if (!rpcUrl || !oracleAddress) throw new Error("Set ROBINHOOD_MAINNET_RPC and PRICE_ORACLE_ADDRESS");
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const network = await provider.getNetwork();
  if (network.chainId !== BigInt(CHAIN_ID)) throw new Error(`Refusing chain ${network.chainId}; expected ${CHAIN_ID}`);

  const symbols = (process.env.BASKET_SYMBOLS ?? DEFAULT_BASKET.join(","))
    .split(",")
    .map((symbol) => symbol.trim().toUpperCase())
    .filter(Boolean);
  const tokens = [];
  for (const symbol of symbols) {
    const token = TOKENS[symbol];
    if (!token || symbol === "USDG") throw new Error(`Invalid basket symbol ${symbol}`);
    tokens.push(token.address);
  }

  const { source, caps, staleReason } = await fetchMarketCaps(symbols);
  const values = symbols.map((symbol) => caps[symbol]);
  console.log(
    JSON.stringify(
      { chainId: CHAIN_ID, oracle: oracleAddress, source, staleReason: staleReason ?? null, caps },
      null,
      2,
    ),
  );
  if (staleReason) {
    await sendAlert("warn", "Market-cap source degraded", { source, reason: staleReason });
  }

  if (!execute) return console.log("Dry run only. Re-run with --execute to post market caps.");

  const signer = await getSigner(provider, "oracle");
  const oracle = new ethers.Contract(oracleAddress, ORACLE_ABI, signer);
  try {
    await oracle.postMarketCaps.staticCall(tokens, values);
    const tx = await oracle.postMarketCaps(tokens, values);
    console.log(`postMarketCaps tx: ${tx.hash}`);
    await tx.wait();
    console.log("confirmed");
    await sendAlert("info", "Market caps posted", { source, symbols: symbols.join(",") });
  } catch (error) {
    await sendAlert("error", "postMarketCaps failed", { reason: error.message ?? String(error) });
    throw error;
  }
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exitCode = 1;
});
