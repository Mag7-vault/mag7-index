#!/usr/bin/env node
import "dotenv/config";
import { ethers } from "ethers";
import { CHAIN_ID, TOKENS } from "voxelithic-interfaces";
import { getApiHealth } from "./voxelithic.mjs";

const VAULT_ABI = ["function asset() view returns(address)", "function oracle() view returns(address)", "function paused() view returns(bool)", "function basketLength() view returns(uint256)", "function basketTokens(uint256) view returns(address)", "function MIN_IDLE_USDG_BPS() view returns(uint16)", "function totalAssets() view returns(uint256)"];
const ORACLE_ABI = ["function prices(address) view returns(uint256 priceUsdg,uint64 updatedAt)", "function maxStaleness() view returns(uint256)"];
const ERC20_ABI = ["function balanceOf(address) view returns(uint256)"];

async function main() {
  const rpcUrl = process.env.ROBINHOOD_MAINNET_RPC;
  const vaultAddress = process.env.INDEX_VAULT_ADDRESS;
  if (!rpcUrl || !vaultAddress) throw new Error("Set ROBINHOOD_MAINNET_RPC and INDEX_VAULT_ADDRESS");
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const network = await provider.getNetwork();
  if (network.chainId !== BigInt(CHAIN_ID)) throw new Error(`Unexpected chain ${network.chainId}`);
  const vault = new ethers.Contract(vaultAddress, VAULT_ABI, provider);
  const [assetAddress, oracleAddress, paused, count, bufferBps, block, api] = await Promise.all([vault.asset(), vault.oracle(), vault.paused(), vault.basketLength(), vault.MIN_IDLE_USDG_BPS(), provider.getBlock("latest"), getApiHealth()]);
  if (assetAddress.toLowerCase() !== TOKENS.USDG.address.toLowerCase()) throw new Error("Non-canonical vault asset");
  const oracle = new ethers.Contract(oracleAddress, ORACLE_ABI, provider);
  const [idle, maxStaleness] = await Promise.all([new ethers.Contract(assetAddress, ERC20_ABI, provider).balanceOf(vaultAddress), oracle.maxStaleness()]);
  const prices = [];
  let stale = false;
  for (let i = 0n; i < count; i += 1n) {
    const token = await vault.basketTokens(i);
    const [price, updatedAt] = await oracle.prices(token);
    const age = BigInt(block.timestamp) - updatedAt;
    if (updatedAt === 0n || age > maxStaleness) stale = true;
    prices.push({ token, priceUsdg: price.toString(), updatedAt: Number(updatedAt), ageSeconds: Number(age) });
  }
  let totalAssets;
  try { totalAssets = await vault.totalAssets(); } catch { totalAssets = null; }
  const bufferHealthy = totalAssets === null || idle * 10_000n >= totalAssets * BigInt(bufferBps);
  const report = { ok: !stale && bufferHealthy, chainId: Number(network.chainId), blockNumber: block.number, apiStatus: api.status ?? "ok", vault: vaultAddress, paused, idleUsdg: ethers.formatUnits(idle, 6), totalAssetsUsdg: totalAssets === null ? null : ethers.formatUnits(totalAssets, 6), bufferHealthy, stalePrices: stale, prices };
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 2;
}

main().catch((error) => { console.error(JSON.stringify({ ok: false, error: error.message ?? String(error) })); process.exitCode = 1; });
