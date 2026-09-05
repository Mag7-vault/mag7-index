export const FLOW_CYCLE_MS = 7000;
export const RELEASE_MS = 3000;

// One clock drives the vault reaction and outgoing particles, including pauses.
export function vaultReaction(flowTime: number) {
  if (flowTime < 0) return { turn: 0, charge: 0 };
  const cycle = flowTime % FLOW_CYCLE_MS;
  const progress = Math.min(1, Math.max(0, (cycle - 1500) / 1300));
  const eased = progress * progress * (3 - 2 * progress);
  return {
    turn: (Math.floor(flowTime / FLOW_CYCLE_MS) + eased) * 90,
    charge: Math.sin(progress * Math.PI),
  };
}
