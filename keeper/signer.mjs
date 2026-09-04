import "dotenv/config";
import { ethers } from "ethers";

// Pluggable signer for keeper transactions. The default ("raw") reads a scoped
// private key from the environment — unchanged from the original keeper. Set
// KEEPER_SIGNER_KIND=module + KEEPER_SIGNER_MODULE to a file that exports
// `createSigner(provider, role)` to source keys from a KMS/HSM instead, so the
// raw key never touches disk. See keeper/signers/aws-kms.example.mjs.

const KEY_ENV_BY_ROLE = {
  oracle: "ORACLE_KEEPER_PRIVATE_KEY",
  rebalance: "REBALANCE_KEEPER_PRIVATE_KEY",
};

export async function getSigner(provider, role, options = {}) {
  const kind = (options.kind ?? process.env.KEEPER_SIGNER_KIND ?? "raw").toLowerCase();

  if (kind === "raw") {
    const envName = KEY_ENV_BY_ROLE[role];
    if (!envName) throw new Error(`Unknown signer role ${role}`);
    const key = options.privateKey ?? process.env[envName];
    if (!key) throw new Error(`Set ${envName} (or configure KEEPER_SIGNER_KIND)`);
    return new ethers.Wallet(key, provider);
  }

  if (kind === "module") {
    const modulePath = options.modulePath ?? process.env.KEEPER_SIGNER_MODULE;
    if (!modulePath) throw new Error("KEEPER_SIGNER_KIND=module requires KEEPER_SIGNER_MODULE");
    const mod = await import(modulePath);
    if (typeof mod.createSigner !== "function") {
      throw new Error(`${modulePath} must export createSigner(provider, role)`);
    }
    const signer = await mod.createSigner(provider, role);
    if (!signer || typeof signer.getAddress !== "function" || typeof signer.sendTransaction !== "function") {
      throw new Error("createSigner must return an ethers Signer");
    }
    return signer;
  }

  throw new Error(`Unsupported KEEPER_SIGNER_KIND ${kind}`);
}
