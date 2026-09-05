#!/usr/bin/env node
import "dotenv/config";
import { ethers } from "ethers";
import { CHAIN_ID, TOKENS } from "voxelithic-interfaces";
import { getQuote } from "./voxelithic.mjs";
import { getSigner } from "./signer.mjs";
import { sendAlert } from "./notify.mjs";

const ORACLE_ABI = ["function postPrices(address[] tokens,uint256[] priceUsdg18) external"];
const DEFAULT_BASKET = ["NVDA", "AAPL", "GOOGL", "QQQ", "NFLX"];

async function main() {
  const rpcUrl = process.env.ROBINHOOD_MAINNET_RPC;
  const oracleAddress = process.env.PRICE_ORACLE_ADDRESS;
  const rawSigner = (process.env.KEEPER_SIGNER_KIND ?? "raw").toLowerCase() === "raw";
  if (!rpcUrl || !oracleAddress || (rawSigner && !process.env.ORACLE_KEEPER_PRIVATE_KEY)) {
    throw new Error("Set ROBINHOOD_MAINNET_RPC, PRICE_ORACLE_ADDRESS, and ORACLE_KEEPER_PRIVATE_KEY");
  }
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const network = await provider.getNetwork();
  if (network.chainId !== BigInt(CHAIN_ID)) throw new Error(`Refusing chain ${network.chainId}; expected ${CHAIN_ID}`);
  const symbols = (process.env.BASKET_SYMBOLS ?? DEFAULT_BASKET.join(",")).split(",").map((symbol) => symbol.trim().toUpperCase()).filter(Boolean);
  const tokens = [];
  const prices = [];
  for (const symbol of symbols) {
    const token = TOKENS[symbol];
    if (!token || symbol === "USDG") throw new Error(`Invalid basket symbol ${symbol}`);
    const result = await getQuote(symbol, "USDG", "1", { maxPriceImpactBps: 100 });
    tokens.push(token.address);
    prices.push(result.quote.amountOutRaw);
    console.log(`${symbol}: 1 token = ${result.quote.amountOut} USDG (${result.quote.family})`);
  }
  const signer = await getSigner(provider, "oracle");
  const oracle = new ethers.Contract(oracleAddress, ORACLE_ABI, signer);
  try {
    await oracle.postPrices.staticCall(tokens, prices);
    const tx = await oracle.postPrices(tokens, prices);
    console.log(`postPrices tx: ${tx.hash}`);
    await tx.wait();
    console.log("confirmed");
  } catch (error) {
    await sendAlert("error", "postPrices failed", { oracle: oracleAddress, reason: error.message ?? String(error) });
    throw error;
  }
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exitCode = 1;
});
