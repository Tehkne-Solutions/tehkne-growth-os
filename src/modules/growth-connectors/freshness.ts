import type { ConnectorCheckpoint, ConnectorConnectionStatus } from "./types";

export type FreshnessState = "fresh" | "aging" | "stale" | "unavailable";

export type ConnectorHealth = Readonly<{
  freshness: FreshnessState;
  ageMinutes: number | null;
  healthy: boolean;
  reason: string;
}>;

export function evaluateConnectorHealth(input: Readonly<{
  status: ConnectorConnectionStatus;
  checkpoint: ConnectorCheckpoint | null;
  now: Date;
  freshWithinMinutes?: number;
  staleAfterMinutes?: number;
}>): ConnectorHealth {
  const freshWithin = input.freshWithinMinutes ?? 180;
  const staleAfter = input.staleAfterMinutes ?? 720;

  if (input.status !== "ACTIVE") {
    return { freshness: "unavailable", ageMinutes: null, healthy: false, reason: `connection_${input.status.toLowerCase()}` };
  }
  if (!input.checkpoint?.lastSuccessAt) {
    return { freshness: "unavailable", ageMinutes: null, healthy: false, reason: "never_synchronized" };
  }

  const ageMinutes = Math.max(0, Math.floor((input.now.getTime() - input.checkpoint.lastSuccessAt.getTime()) / 60_000));
  if (input.checkpoint.consecutiveFailures >= 3) {
    return { freshness: "stale", ageMinutes, healthy: false, reason: "repeated_failures" };
  }
  if (ageMinutes <= freshWithin) {
    return { freshness: "fresh", ageMinutes, healthy: true, reason: "within_freshness_slo" };
  }
  if (ageMinutes < staleAfter) {
    return { freshness: "aging", ageMinutes, healthy: true, reason: "approaching_stale_threshold" };
  }
  return { freshness: "stale", ageMinutes, healthy: false, reason: "stale_data" };
}
