import { describe, expect, it } from "vitest";

import { classifyClientPortfolioAttention } from "@/modules/client-operations/portfolio-overview";

const healthy = {
  lifecycleState: "STABLE_GROWTH",
  handoverComplete: true,
  handoverBlocked: 0,
  trackingStatus: "HEALTHY" as const,
  connectorAlerts: 0,
  connectorCriticalAlerts: 0,
  openActions: 0,
  inProgressActions: 0,
};

describe("client portfolio attention policy", () => {
  it("returns NO_ACTION only when no deterministic exception exists", () => {
    expect(classifyClientPortfolioAttention(healthy)).toEqual({ state: "NO_ACTION", reasons: [] });
  });

  it("makes broken tracking critical", () => {
    const result = classifyClientPortfolioAttention({ ...healthy, trackingStatus: "BROKEN" });
    expect(result.state).toBe("CRITICAL");
    expect(result.reasons).toContain("tracking_broken");
  });

  it("makes connector authentication/repeated failure alerts critical", () => {
    const result = classifyClientPortfolioAttention({ ...healthy, connectorAlerts: 1, connectorCriticalAlerts: 1 });
    expect(result.state).toBe("CRITICAL");
    expect(result.reasons).toContain("critical_connector_alert");
  });

  it("requires action for at-risk lifecycle, blocked handover and degraded tracking", () => {
    const result = classifyClientPortfolioAttention({
      ...healthy,
      lifecycleState: "AT_RISK",
      handoverComplete: false,
      handoverBlocked: 1,
      trackingStatus: "DEGRADED",
    });
    expect(result.state).toBe("ACTION_REQUIRED");
    expect(result.reasons).toEqual(expect.arrayContaining(["lifecycle_at_risk", "handover_blocked", "tracking_degraded"]));
  });

  it("surfaces existing human actions instead of hiding them behind a good tracking state", () => {
    const result = classifyClientPortfolioAttention({ ...healthy, openActions: 2 });
    expect(result.state).toBe("ACTION_REQUIRED");
    expect(result.reasons).toContain("growth_actions_open");
  });

  it("uses WATCH for incomplete evidence without inventing urgency", () => {
    const result = classifyClientPortfolioAttention({
      ...healthy,
      lifecycleState: null,
      handoverComplete: false,
      trackingStatus: "UNKNOWN",
    });
    expect(result.state).toBe("WATCH");
    expect(result.reasons).toEqual(expect.arrayContaining(["intake_missing", "handover_incomplete", "tracking_unverified"]));
  });
});
