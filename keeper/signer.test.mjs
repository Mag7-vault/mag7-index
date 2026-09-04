import test from "node:test";
import assert from "node:assert/strict";
import { getSigner } from "./signer.mjs";

const provider = {}; // ethers.Wallet accepts any provider-shaped object here

test("raw signer derives a wallet from the scoped key", async () => {
  const key = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
  const signer = await getSigner(provider, "oracle", { kind: "raw", privateKey: key });
  assert.equal(typeof signer.getAddress, "function");
  assert.equal(await signer.getAddress(), "0x70997970C51812dc3A010C7d01b50e0d17dc79C8");
});

test("raw signer errors clearly when the key is missing", async () => {
  await assert.rejects(() => getSigner(provider, "rebalance", { kind: "raw", privateKey: undefined }), /REBALANCE_KEEPER_PRIVATE_KEY/);
});

test("unknown role is rejected", async () => {
  await assert.rejects(() => getSigner(provider, "nope", { kind: "raw", privateKey: "0x01" }), /Unknown signer role/);
});

test("module signer loads createSigner from a path", async () => {
  const url = `data:text/javascript,export async function createSigner(){return {getAddress(){return "0xabc"},sendTransaction(){}}}`;
  const signer = await getSigner(provider, "oracle", { kind: "module", modulePath: url });
  assert.equal(await signer.getAddress(), "0xabc");
});

test("module signer rejects a module without createSigner", async () => {
  const url = `data:text/javascript,export const nothing = 1`;
  await assert.rejects(() => getSigner(provider, "oracle", { kind: "module", modulePath: url }), /must export createSigner/);
});

test("unsupported kind is rejected", async () => {
  await assert.rejects(() => getSigner(provider, "oracle", { kind: "hsm-9000" }), /Unsupported KEEPER_SIGNER_KIND/);
});
