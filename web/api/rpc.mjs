const PUBLIC_RPC = "https://rpc.mainnet.chain.robinhood.com";
const ALLOWED_METHODS = new Set([
  "eth_call",
  "eth_chainId",
  "eth_getBlockByNumber",
  "eth_getCode",
]);
const MAX_CALLS = 100;
const MAX_BODY_BYTES = 128 * 1024;

export function validateRpcPayload(payload) {
  const calls = Array.isArray(payload) ? payload : [payload];
  if (!calls.length || calls.length > MAX_CALLS) return false;
  return calls.every(
    (call) =>
      call &&
      call.jsonrpc === "2.0" &&
      typeof call.id !== "undefined" &&
      ALLOWED_METHODS.has(call.method) &&
      Array.isArray(call.params),
  );
}

async function forward(endpoint, body) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    return await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({ error: "Method not allowed" });
  }

  let payload;
  try {
    payload =
      typeof request.body === "string"
        ? JSON.parse(request.body)
        : request.body;
  } catch {
    return response.status(400).json({ error: "Invalid JSON" });
  }
  const body = JSON.stringify(payload);
  if (Buffer.byteLength(body) > MAX_BODY_BYTES)
    return response.status(413).json({ error: "Request too large" });
  if (!validateRpcPayload(payload))
    return response.status(403).json({ error: "RPC method not allowed" });

  const endpoints = [process.env.ROBINHOOD_MAINNET_RPC, PUBLIC_RPC].filter(
    (endpoint, index, all) =>
      endpoint && endpoint.startsWith("https://") && all.indexOf(endpoint) === index,
  );
  for (const endpoint of endpoints) {
    try {
      const upstream = await forward(endpoint, body);
      const result = await upstream.text();
      if (upstream.ok) {
        response.setHeader("Cache-Control", "no-store");
        response.setHeader("Content-Type", "application/json");
        return response.status(200).send(result);
      }
      if (upstream.status < 500 && upstream.status !== 429)
        return response.status(upstream.status).send(result);
    } catch (error) {
      console.warn("RPC upstream unavailable", {
        host: new URL(endpoint).host,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return response.status(502).json({ error: "RPC temporarily unavailable" });
}
