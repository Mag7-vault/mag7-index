import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { Contract, ContractFactory, JsonRpcProvider } from "ethers";
import { ContractAdapter } from "../src/adapters";
const artifact = (name: string) =>
  JSON.parse(
    readFileSync(
      new URL(`../../out/${name}.sol/${name}.json`, import.meta.url),
      "utf8",
    ),
  );
test(
  "actual vault adapter: approval, deposit, pause, liquidity limits, stale oracle and in-kind exit",
  { timeout: 120000 },
  async () => {
    const process = spawn(
      "anvil",
      ["--port", "18547", "--host", "127.0.0.1", "--silent"],
      { stdio: "ignore", windowsHide: true },
    );
    const p = new JsonRpcProvider("http://127.0.0.1:18547", undefined, {
      cacheTimeout: -1,
    });
    p.pollingInterval = 50;
    try {
      let ready = false;
      for (let i = 0; i < 40; i++) {
        try {
          await p.getBlockNumber();
          ready = true;
          break;
        } catch {
          await new Promise((r) => setTimeout(r, 200));
        }
      }
      assert.ok(ready, "Anvil starts");
      const signer = await p.getSigner(0),
        account = await signer.getAddress();
      const deploy = async (name: string, args: unknown[]) => {
        const a = artifact(name);
        const c = await new ContractFactory(
          a.abi,
          a.bytecode.object,
          signer,
        ).deploy(...args);
        await c.waitForDeployment();
        return new Contract(await c.getAddress(), a.abi, signer);
      };
      const usdg = await deploy("MockERC20", ["USDG", "USDG", 6]),
        router = await deploy("MockVoxRouter", []),
        oracle = await deploy("PriceOracle", [account]),
        vault = await deploy("IndexVault", [
          usdg.target,
          router.target,
          oracle.target,
          account,
          1000000000000n,
        ]);
      const tokens = [];
      for (const symbol of ["NVDA", "AAPL", "GOOGL", "QQQ", "NFLX"])
        tokens.push(await deploy("MockERC20", [symbol, symbol, 18]));
      await (
        await vault.setBasket(
          tokens.map((t) => t.target),
          [2000, 2000, 2000, 2000, 2000],
        )
      ).wait();
      await (
        await oracle.postPrices(
          tokens.map((t) => t.target),
          [1000000n, 1000000n, 1000000n, 1000000n, 1000000n],
        )
      ).wait();
      await (await usdg.mint(account, 10000000000n)).wait();
      const adapter = new ContractAdapter({
        environment: "local",
        chainId: 31337,
        rpcUrl: "http://127.0.0.1:18547",
        vaultAddress: String(vault.target),
        deploymentBlock: 0,
        explorerUrl: "",
        chainName: "Local fixture",
        nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
      });
      adapter.provider.pollingInterval = 50;
      try {
        let s = await adapter.read(account);
        assert.equal(s.holdings.length, 5);
        assert.deepEqual(
          s.holdings.map((h) => h.symbol),
          ["NVDA", "AAPL", "GOOGL", "QQQ", "NFLX"],
        );
        assert.equal(s.assetDecimals, 6);
        assert.equal(s.allowance, 0n);
        const progress: string[] = [];
        await adapter.execute(
          "deposit",
          1000000000n,
          account,
          (x) => progress.push(x),
          signer,
        );
        assert.ok(progress.some((s) => s.includes("Approve")));
        s = await adapter.read(account);
        assert.equal(s.shares, 1000000000n);
        assert.equal(s.walletAssets, 9000000000n);
        assert.ok(s.allowance >= 100n);
        const secondProgress: string[] = [];
        await adapter.execute(
          "deposit",
          100n,
          account,
          (x) => secondProgress.push(x),
          signer,
          undefined,
          s,
        );
        assert.ok(!secondProgress.some((message) => message.includes("Approve")));
        s = await adapter.read(account);
        await assert.rejects(
          () =>
            adapter.execute(
              "deposit",
              100n,
              account,
              () => {},
              signer,
              () => false,
            ),
          /session changed/,
        );
        assert.equal((await adapter.read(account)).shares, s.shares);
        await (await vault.pause()).wait();
        await assert.rejects(
          () => adapter.quote("deposit", 1n, account),
          /paused/,
        );
        await adapter.execute("redeem", 1000000n, account, () => {}, signer);
        await (await vault.unpause()).wait();
        await (await tokens[0].mint(vault.target, 10000n * 10n ** 18n)).wait();
        s = await adapter.read(account);
        assert.ok(s.maxRedeem! < s.shares);
        await assert.rejects(
          () => adapter.quote("redeem", s.shares, account),
          /idle/,
        );
        await p.send("evm_increaseTime", [7200]);
        await p.send("evm_mine", []);
        s = await adapter.read(account);
        assert.equal(s.nav, null);
        assert.equal(s.maxRedeem, null);
        const q = await adapter.quote("inKind", 1000000n, account);
        assert.ok(q.tokens[0] > 0n);
        await (await vault.pause()).wait();
        await adapter.execute("inKind", 1000000n, account, () => {}, signer);
        assert.ok((await tokens[0].balanceOf(account)) > 0n);
        const other = await (await p.getSigner(1)).getAddress();
        await assert.rejects(
          () => adapter.execute("inKind", 1n, other, () => {}, signer),
          /account changed/,
        );
      } finally {
        adapter.provider.destroy();
      }
    } finally {
      p.destroy();
      process.kill();
    }
  },
);
