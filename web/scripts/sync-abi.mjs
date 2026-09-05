import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
const output = new URL("../src/abi/", import.meta.url);
mkdirSync(output, { recursive: true });
for (const name of ["IndexVault", "PriceOracle", "ERC20"]) {
  const artifact = new URL(
    `../../out/${name}.sol/${name}.json`,
    import.meta.url,
  );
  const { abi } = JSON.parse(readFileSync(artifact, "utf8"));
  writeFileSync(
    new URL(`${name}.json`, output),
    JSON.stringify(abi, null, 2) + "\n",
  );
  console.log(`${name}: ${abi.length} ABI entries → ${fileURLToPath(output)}`);
}
