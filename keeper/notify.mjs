import "dotenv/config";

// Webhook alerting for the keeper. Deliberately non-fatal: a failed or
// unconfigured webhook must never crash a price post or a rebalance. Slack and
// Discord both accept a single-string body, so we auto-detect the shape from
// the URL (or an explicit ALERT_WEBHOOK_KIND) and fall back to logging.

const LEVELS = new Set(["info", "warn", "error"]);

export function detectKind(url, explicit) {
  if (explicit) return String(explicit).toLowerCase();
  if (/discord(app)?\.com/i.test(url)) return "discord";
  return "slack";
}

export function formatMessage(level, title, fields = {}) {
  const badge = level === "error" ? "🔴" : level === "warn" ? "🟠" : "🟢";
  const lines = Object.entries(fields).map(([key, value]) => `• ${key}: ${value}`);
  return [`${badge} [${level.toUpperCase()}] ${title}`, ...lines].join("\n");
}

export function buildPayload(kind, text) {
  return kind === "discord" ? { content: text } : { text };
}

/// Send one alert. Resolves to a delivery report and never throws.
export async function sendAlert(level, title, fields = {}, options = {}) {
  const lvl = LEVELS.has(level) ? level : "info";
  const text = formatMessage(lvl, title, fields);
  const url = options.url ?? process.env.ALERT_WEBHOOK_URL;
  if (!url) {
    console.error(`[alert:${lvl}] ${title} ${JSON.stringify(fields)}`);
    return { delivered: false, reason: "no-webhook" };
  }
  const kind = detectKind(url, options.kind ?? process.env.ALERT_WEBHOOK_KIND);
  const fetchImpl = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 10_000);
  try {
    const response = await fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(buildPayload(kind, text)),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`webhook ${response.status}`);
    return { delivered: true, kind };
  } catch (error) {
    console.error(`[alert:delivery-failed] ${error.message ?? error}`);
    return { delivered: false, reason: error.message ?? String(error) };
  } finally {
    clearTimeout(timeout);
  }
}
