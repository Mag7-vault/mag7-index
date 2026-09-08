import assert from "node:assert/strict";
import test from "node:test";
import { validateRpcPayload } from "../api/rpc.mjs";

test("RPC proxy accepts only the read methods required by the vault", () => {
  assert.equal(
    validateRpcPayload({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_call",
      params: [{ to: "0x1", data: "0x" }, "latest"],
    }),
    true,
  );
  assert.equal(
    validateRpcPayload([
      { jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] },
      {
        jsonrpc: "2.0",
        id: 2,
        method: "eth_getBlockByNumber",
        params: ["latest", false],
      },
    ]),
    true,
  );
  assert.equal(
    validateRpcPayload({
      jsonrpc: "2.0",
      id: 3,
      method: "eth_sendRawTransaction",
      params: ["0xdeadbeef"],
    }),
    false,
  );
});
