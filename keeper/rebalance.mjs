#!/usr/bin/env node
import "dotenv/config";
import { ethers } from "ethers";
import { CHAIN_ID, ROUTER, TOKENS } from "voxelithic-interfaces";
import { getQuote, toV3Hops } from "./voxelithic.mjs";

const VAULT_ABI = [
  "function asset() view returns (address)", "function router() view returns (address)",
  "function basketLength() view returns (uint256)", "function basketTokens(uint256) view returns (address)",
  "function targetWeightBps(address) view returns (uint16)", "function MIN_IDLE_USDG_BPS() view returns (uint16)",
  "function rebalance((address tokenIn,address tokenOut,uint256 amountIn,uint256 minOut,uint256 deadline,(uint8 kind,address pool,bool zeroForOne,uint24 feePpm)[] hops)[] legs)",
  "function restoreLiquidity((address tokenIn,address tokenOut,uint256 amountIn,uint256 minOut,uint256 deadline,(uint8 kind,address pool,bool zeroForOne,uint24 feePpm)[] hops)[] legs)",
];
const ERC20_ABI = ["function balanceOf(address) view returns (uint256)", "function decimals() view returns (uint8)"];
const SYMBOL_BY_ADDRESS = new Map(Object.values(TOKENS).map((token) => [token.address.toLowerCase(), token.symbol]));
const decimalFromRaw = (value, decimals) => ethers.formatUnits(value, decimals);

async function main() {
  const execute = process.argv.includes("--execute");
  const restore = process.argv.includes("--restore-liquidity");
  const rpcUrl = process.env.ROBINHOOD_MAINNET_RPC;
  const vaultAddress = process.env.INDEX_VAULT_ADDRESS;
  if (!rpcUrl || !vaultAddress) throw new Error("Set ROBINHOOD_MAINNET_RPC and INDEX_VAULT_ADDRESS");
  if (execute && !process.env.REBALANCE_KEEPER_PRIVATE_KEY) throw new Error("--execute requires REBALANCE_KEEPER_PRIVATE_KEY");
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const network = await provider.getNetwork();
  if (network.chainId !== BigInt(CHAIN_ID)) throw new Error(`Refusing chain ${network.chainId}; expected ${CHAIN_ID}`);
  const vault = new ethers.Contract(vaultAddress, VAULT_ABI, provider);
  const [assetAddress, routerAddress, basketLength, bufferBps] = await Promise.all([vault.asset(), vault.router(), vault.basketLength(), vault.MIN_IDLE_USDG_BPS()]);
  if (assetAddress.toLowerCase() !== TOKENS.USDG.address.toLowerCase()) throw new Error("Vault asset is not canonical USDG");
  if (routerAddress.toLowerCase() !== ROUTER.toLowerCase()) throw new Error("Vault router is not the canonical VoxRouter");
  const asset = new ethers.Contract(assetAddress, ERC20_ABI, provider);
  const idle = await asset.balanceOf(vaultAddress);
  const entries = [];
  let estimatedNav = idle;
  for (let i = 0n; i < basketLength; i += 1n) {
    const address = await vault.basketTokens(i);
    const symbol = SYMBOL_BY_ADDRESS.get(address.toLowerCase());
    if (!symbol) throw new Error(`Unknown basket token ${address}`);
    const token = new ethers.Contract(address, ERC20_ABI, provider);
    const [balance, decimals, weight] = await Promise.all([token.balanceOf(vaultAddress), token.decimals(), vault.targetWeightBps(address)]);
    let value = 0n;
    if (balance > 0n) {
      const result = await getQuote(symbol, "USDG", decimalFromRaw(balance, decimals), { maxPriceImpactBps: 100 });
      value = BigInt(result.quote.amountOutRaw);
    }
    estimatedNav += value;
    entries.push({ address, symbol, balance, decimals, weight: BigInt(weight), value });
  }
  const targetIdle = (estimatedNav * BigInt(bufferBps) + 9_999n) / 10_000n;
  const toleranceBps = BigInt(process.env.REBALANCE_TOLERANCE_BPS ?? "25");
  const deadline = Math.floor(Date.now() / 1000) + Number(process.env.SWAP_DEADLINE_SECONDS ?? "300");
  const slippageBps = Number(process.env.MAX_SLIPPAGE_BPS ?? "100");
  const maxPriceImpactBps = Number(process.env.MAX_PRICE_IMPACT_BPS ?? "100");
  const legs = [];
  if (restore) {
    const requested = ethers.parseUnits(process.env.RESTORE_USDG_AMOUNT ?? decimalFromRaw(targetIdle, 6), 6);
    let needed = requested > idle ? requested - idle : 0n;
    for (const entry of entries) {
      if (needed === 0n || entry.balance === 0n || entry.value === 0n) continue;
      const valueToSell = needed < entry.value ? needed : entry.value;
      const amountIn = (entry.balance * valueToSell + entry.value - 1n) / entry.value;
      const result = await getQuote(entry.symbol, "USDG", decimalFromRaw(amountIn, entry.decimals), { slippageBps, maxPriceImpactBps });
      legs.push({ tokenIn: entry.address, tokenOut: assetAddress, amountIn, minOut: result.quote.minOutRaw, deadline, hops: toV3Hops(result) });
      const expected = BigInt(result.quote.amountOutRaw);
      needed = expected >= needed ? 0n : needed - expected;
    }
    if (needed > 0n) throw new Error(`Unable to restore requested liquidity; short ${ethers.formatUnits(needed, 6)} USDG`);
  } else {
    const investable = estimatedNav - targetIdle;
    let projectedIdle = idle;
    for (const entry of entries) {
      const target = (investable * entry.weight) / 10_000n;
      const tolerance = (estimatedNav * toleranceBps) / 10_000n;
      if (entry.value > target + tolerance && entry.balance > 0n) {
        const amountIn = (entry.balance * (entry.value - target)) / entry.value;
        const result = await getQuote(entry.symbol, "USDG", decimalFromRaw(amountIn, entry.decimals), { slippageBps, maxPriceImpactBps });
        legs.push({ tokenIn: entry.address, tokenOut: assetAddress, amountIn, minOut: result.quote.minOutRaw, deadline, hops: toV3Hops(result) });
        projectedIdle += BigInt(result.quote.amountOutRaw);
      }
    }
    let buyBudget = projectedIdle > targetIdle ? projectedIdle - targetIdle : 0n;
    for (const entry of entries) {
      const target = (investable * entry.weight) / 10_000n;
      const tolerance = (estimatedNav * toleranceBps) / 10_000n;
      if (entry.value + tolerance < target && buyBudget > 0n) {
        const amountIn = target - entry.value < buyBudget ? target - entry.value : buyBudget;
        const result = await getQuote("USDG", entry.symbol, decimalFromRaw(amountIn, 6), { slippageBps, maxPriceImpactBps });
        legs.push({ tokenIn: assetAddress, tokenOut: entry.address, amountIn, minOut: result.quote.minOutRaw, deadline, hops: toV3Hops(result) });
        buyBudget -= amountIn;
      }
    }
  }
  console.log(JSON.stringify({ chainId: CHAIN_ID, vault: vaultAddress, mode: restore ? "restoreLiquidity" : "rebalance", estimatedNavUsdg: decimalFromRaw(estimatedNav, 6), idleUsdg: decimalFromRaw(idle, 6), targetIdleUsdg: decimalFromRaw(targetIdle, 6), legs: legs.map((leg) => ({ ...leg, amountIn: leg.amountIn.toString(), minOut: leg.minOut.toString() })) }, null, 2));
  if (!execute) return console.log("Dry run only. Re-run with --execute after reviewing every leg.");
  if (legs.length === 0) return console.log("No trades required.");
  const connectedVault = vault.connect(new ethers.Wallet(process.env.REBALANCE_KEEPER_PRIVATE_KEY, provider));
  if (restore) await connectedVault.restoreLiquidity.staticCall(legs);
  else await connectedVault.rebalance.staticCall(legs);
  const tx = restore ? await connectedVault.restoreLiquidity(legs) : await connectedVault.rebalance(legs);
  console.log(`${restore ? "restoreLiquidity" : "rebalance"} tx: ${tx.hash}`);
  await tx.wait();
  console.log("confirmed");
}

main().catch((error) => { console.error(error.message ?? error); process.exitCode = 1; });
