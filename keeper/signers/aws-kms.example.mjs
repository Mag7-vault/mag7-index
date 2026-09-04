// REFERENCE ONLY — a starting point for a KMS-backed signer, not wired by default.
//
// Running keeper keys from AWS KMS keeps the raw private key off disk entirely:
// KMS holds the secp256k1 key and signs digests; the keeper only ever sees
// signatures. To use it:
//
//   1. Create an asymmetric KMS key: key spec ECC_SECG_P256K1, usage SIGN_VERIFY.
//   2. Grant the keeper's IAM principal kms:Sign + kms:GetPublicKey on that key.
//   3. npm i @aws-sdk/client-kms @rumblefishdev/eth-aws-kms-signer (or similar).
//   4. Set KEEPER_SIGNER_KIND=module and
//      KEEPER_SIGNER_MODULE=./signers/aws-kms.example.mjs (copy + fill in first).
//
// The vault/oracle never learn the signer is KMS-backed — getAddress() returns
// the derived EOA and that address is what you allowlist via setKeeper().

/* eslint-disable */
export async function createSigner(provider, role) {
  const keyIdEnv = role === "oracle" ? "ORACLE_KMS_KEY_ID" : "REBALANCE_KMS_KEY_ID";
  const keyId = process.env[keyIdEnv];
  if (!keyId) throw new Error(`Set ${keyIdEnv} to the KMS key ARN/ID for the ${role} signer`);

  // Example wiring with a maintained KMS→ethers signer. Uncomment after install:
  //
  //   const { AwsKmsSigner } = await import("@rumblefishdev/eth-aws-kms-signer");
  //   return new AwsKmsSigner({ keyId, region: process.env.AWS_REGION }).connect(provider);
  //
  // Any object implementing ethers' Signer interface (getAddress, signTransaction,
  // sendTransaction, connect) is acceptable — signer.mjs validates the shape.

  throw new Error(
    "aws-kms.example.mjs is a template: install a KMS signer library and return it here (see comments).",
  );
}
