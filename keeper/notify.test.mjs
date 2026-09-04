import test from "node:test";
import assert from "node:assert/strict";
import { detectKind, formatMessage, buildPayload, sendAlert } from "./notify.mjs";

test("detects Discord vs Slack from the URL", () => {
  assert.equal(detectKind("https://discord.com/api/webhooks/1/abc"), "discord");
  assert.equal(detectKind("https://hooks.slack.com/services/x/y/z"), "slack");
  assert.equal(detectKind("https://example.com/hook"), "slack"); // default
  assert.equal(detectKind("https://example.com/hook", "discord"), "discord"); // explicit override
});

test("formats a message with level badge and fields", () => {
  const text = formatMessage("error", "rebalance failed", { vault: "0xabc", reason: "slippage" });
  assert.match(text, /\[ERROR\] rebalance failed/);
  assert.match(text, /• vault: 0xabc/);
  assert.match(text, /• reason: slippage/);
});

test("payload shape matches the target service", () => {
  assert.deepEqual(buildPayload("slack", "hi"), { text: "hi" });
  assert.deepEqual(buildPayload("discord", "hi"), { content: "hi" });
});

test("posts to the configured webhook", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return { ok: true };
  };
  const result = await sendAlert("info", "hello", { a: 1 }, { url: "https://hooks.slack.com/x", fetchImpl });
  assert.equal(result.delivered, true);
  assert.equal(calls.length, 1);
  assert.deepEqual(JSON.parse(calls[0].init.body), { text: formatMessage("info", "hello", { a: 1 }) });
});

test("never throws when the webhook fails", async () => {
  const fetchImpl = async () => {
    throw new Error("network down");
  };
  const result = await sendAlert("error", "boom", {}, { url: "https://hooks.slack.com/x", fetchImpl });
  assert.equal(result.delivered, false);
  assert.match(result.reason, /network down/);
});

test("no webhook configured is a no-op, not an error", async () => {
  const result = await sendAlert("warn", "unconfigured", {}, { url: "" });
  assert.equal(result.delivered, false);
  assert.equal(result.reason, "no-webhook");
});
