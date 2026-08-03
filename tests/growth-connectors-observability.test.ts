import { describe, expect, it } from "vitest";

import {
  classifySchedulerStatus,
  deriveConnectorNotificationCandidates,
  type SchedulerRunObservation,
} from "@/modules/growth-connectors/observability";

const now = new Date("2026-08-03T12:00:00.000Z");

function schedulerRun(overrides: Partial<SchedulerRunObservation> = {}): SchedulerRunObservation {
  return {
    runId: "run-1",
    triggerSource: "GITHUB_ACTIONS",
    status: "SUCCEEDED",
    startedAt: new Date("2026-08-03T09:00:00.000Z"),
    finishedAt: new Date("2026-08-03T09:00:20.000Z"),
    budgetMs: 45_000,
    connectionsSelected: 2,
    connectionsSucceeded: 2,
    connectionsFailed: 0,
    alertCount: 0,
    ...overrides,
  };
}

describe("connector observability", () => {
  it("classifies a recent successful scheduler run as healthy", () => {
    expect(classifySchedulerStatus(schedulerRun(), now)).toBe("healthy");
  });

  it("classifies failed or overdue scheduler activity as degraded", () => {
    expect(classifySchedulerStatus(schedulerRun({ status: "FAILED" }), now)).toBe("degraded");
    expect(classifySchedulerStatus(schedulerRun({ startedAt: new Date("2026-08-03T04:00:00.000Z") }), now)).toBe("degraded");
  });

  it("marks connection errors and repeated failures as critical notification candidates", () => {
    const candidates = deriveConnectorNotificationCandidates([
      {
        connectionId: "connection-1",
        workspaceId: "workspace-1",
        provider: "GOOGLE_ADS",
        displayName: "Google Ads Principal",
        reason: "repeated_failures",
        consecutiveFailures: 4,
        lastSuccessAt: new Date("2026-08-02T10:00:00.000Z"),
      },
      {
        connectionId: "connection-2",
        workspaceId: "workspace-1",
        provider: "META_ADS",
        displayName: "Meta Ads Principal",
        reason: "stale_data",
        consecutiveFailures: 0,
        lastSuccessAt: new Date("2026-08-02T00:00:00.000Z"),
      },
    ]);

    expect(candidates[0]?.severity).toBe("critical");
    expect(candidates[1]?.severity).toBe("warning");
    expect(candidates[0]?.detail).toContain("4 falhas consecutivas");
  });
});
