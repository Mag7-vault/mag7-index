import { test } from "node:test";
import assert from "node:assert/strict";
import { DemoAdapter, confirmed, withRpcRetry } from "../src/adapters";
import {
  amountFromInput,
  demoAccount,
  friendlyError,
  initialBasketPreview,
  parseDeployment,
  units,
  validate,
} from "../src/model";
import { projectArticles, searchArticles } from "../src/docs";
import { vaultReaction, RELEASE_MS } from "../src/flowTiming";
test("vault reacts only after deposit arrival and settles before release", () => {
  assert.deepEqual(vaultReaction(-1), { turn: 0, charge: 0 });
  assert.equal(vaultReaction(1500).turn, 0);
  assert.equal(vaultReaction(2150).turn, 45);
  assert.equal(vaultReaction(2150).charge, 1);
  assert.equal(vaultReaction(2800).turn, 90);
  assert.ok(RELEASE_MS > 2800);
  assert.equal(vaultReaction(6999).turn, vaultReaction(7000).turn);
});
test("initial basket preview renders the known targets before RPC data", () => {
  assert.deepEqual(
    initialBasketPreview.map(({ symbol, weight }) => [symbol, weight]),
    [
      ["NVDA", 2000],
      ["AAPL", 2000],
      ["GOOGL", 2000],
      ["QQQ", 2000],
      ["NFLX", 2000],
    ],
  );
});
test("amounts preserve integer precision and reject unsafe input", () => {
  assert.equal(amountFromInput("123.000001", 6), 123000001n);
  for (const value of ["-1", "0", "1e3", "NaN", "1.0000001"])
    assert.throws(() => amountFromInput(value, 6));
  assert.equal(units(9007199254740993123456n, 6), "9,007,199,254,740,993.12");
});
test("demo deposits, USDG exits and in-kind exits update balances", async () => {
  const a = new DemoAdapter();
  const before = await a.read(demoAccount);
  assert.deepEqual(
    before.holdings.map((h) => h.symbol),
    ["NVDA", "AAPL", "GOOGL", "QQQ", "NFLX"],
  );
  await a.execute("deposit", 100000000n, demoAccount, () => {});
  assert.equal((await a.read(demoAccount)).shares, before.shares + 100000000n);
  await a.execute("redeem", 50000000n, demoAccount, () => {});
  const q = await a.quote("inKind", 10000000n, demoAccount);
  assert.equal(q.tokens.length, 5);
  await a.execute("inKind", 10000000n, demoAccount, () => {});
  assert.ok(
    (await a.read(demoAccount)).holdings[0].balance <
      before.holdings[0].balance,
  );
});
test("pause, stale NAV and idle liquidity have distinct exit behavior", async () => {
  const a = new DemoAdapter();
  a.paused = true;
  let s = await a.read(demoAccount);
  assert.throws(() => validate("deposit", 1n, s), /paused/);
  validate("redeem", 1n, s);
  a.stale = true;
  s = await a.read(demoAccount);
  assert.throws(() => validate("redeem", 1n, s), /fresh/);
  validate("inKind", 1n, s);
  a.stale = false;
  a.idle = 1n;
  s = await a.read(demoAccount);
  assert.throws(() => validate("redeem", 100n, s), /idle/);
});
test("configuration never treats invalid configuration as a demo", () => {
  assert.equal(parseDeployment(null), null);
  assert.throws(() => parseDeployment({ environment: "mainnet" }));
  const config = parseDeployment({
    environment: "mainnet",
    chainId: 4663,
    rpcUrl: "/api/rpc",
    vaultAddress: "0xaAF58BD0Dfe5aD5514f421C02959ef44D2fB0ca8",
    publicContractAddress: null,
    deploymentBlock: 55387046,
    explorerUrl: "https://robinhoodchain.blockscout.com",
    chainName: "Robinhood Chain",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  });
  assert.equal(config?.rpcUrl, "http://localhost/api/rpc");
});
test("transient RPC failures are retried but contract failures are not", async () => {
  let attempts = 0;
  assert.equal(
    await withRpcRetry(async () => {
      attempts += 1;
      if (attempts < 3) throw new TypeError("Failed to fetch");
      return "ready";
    }, [0, 0]),
    "ready",
  );
  assert.equal(attempts, 3);
  await assert.rejects(
    withRpcRetry(async () => {
      throw Object.assign(new Error("execution reverted"), {
        code: "CALL_EXCEPTION",
      });
    }, [0, 0]),
    /execution reverted/,
  );
});
test("a changed wallet session stops pending demo execution", async () => {
  const a = new DemoAdapter();
  const before = await a.read(demoAccount);
  await assert.rejects(
    a.execute(
      "deposit",
      100n,
      demoAccount,
      () => {},
      undefined,
      () => false,
    ),
    /session changed/,
  );
  assert.equal((await a.read(demoAccount)).shares, before.shares);
});
test("documentation search checks article bodies and missing results", () => {
  assert.ok(searchArticles("48 hours").length);
  assert.ok(
    searchArticles("portion of the vault").some(
      (a) => a.slug === "withdrawals",
    ),
  );
  assert.ok(projectArticles.some((a) => a.slug === "project-contracts"));
  assert.ok(
    searchArticles("latestRoundData").some((a) => a.slug === "project-oracle"),
  );
  for (const slug of [
    "project-status",
    "project-interface",
    "project-verification",
    "project-failures",
    "project-changelog",
    "project-development",
  ])
    assert.ok(!projectArticles.some((article) => article.slug === slug));
  assert.equal(searchArticles("xyz-no-match-123").length, 0);
});
test("wallet errors and replacement receipts are explicit", async () => {
  assert.match(friendlyError({ code: 4001 }), /declined/);
  assert.match(friendlyError({ code: "INSUFFICIENT_FUNDS" }), /gas/);
  const tx = {
    wait: async () => {
      throw {
        code: "TRANSACTION_REPLACED",
        cancelled: false,
        receipt: { status: 1, hash: "replaced" },
      };
    },
  };
  assert.equal(await confirmed(tx as never), "replaced");
  await assert.rejects(() =>
    confirmed({ wait: async () => ({ status: 0 }) } as never),
  );
});
