import { units } from "./model";
import type { VaultContext } from "./useVault";
export function VaultStatus({ ctx }: { ctx: VaultContext }) {
  const s = ctx.snapshot;
  if (!s) return null;
  return (
    <div className="vault-status">
      <span>
        <i className="status-dot" />
        {s.paused
          ? "Deposits paused"
          : s.maxDeposit === 0n
            ? "Deposits closed"
            : s.maxDeposit === null
              ? "Valuation unavailable"
              : "Deposit capacity available"}
      </span>
      <span>
        Cap: {units(s.cap, s.assetDecimals)} {s.assetSymbol}
      </span>
      <span>
        Remaining: {units(s.maxDeposit, s.assetDecimals)} {s.assetSymbol}
      </span>
      <span>
        Last rebalance:{" "}
        {s.mode === "demo"
          ? "Simulated"
          : s.lastRebalance
            ? new Date(s.lastRebalance * 1000).toLocaleString()
            : "Not recorded"}
      </span>
    </div>
  );
}
