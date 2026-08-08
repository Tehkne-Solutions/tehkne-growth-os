import { describe, expect, it } from "vitest";

import {
  CLIENT_LIFECYCLE_STATES,
  getAllowedClientLifecycleTransitions,
} from "@/modules/client-operations/client-profile";

describe("client operations lifecycle", () => {
  it("keeps the canonical operating states stable", () => {
    expect(CLIENT_LIFECYCLE_STATES).toEqual([
      "INTAKE",
      "ACCESS_PENDING",
      "AUDIT",
      "TRACKING_REPAIR",
      "STRATEGY_READY",
      "LAUNCHING",
      "LEARNING",
      "OPTIMIZING",
      "SCALING",
      "STABLE_GROWTH",
      "AT_RISK",
      "PAUSED",
      "OFFBOARDING",
    ]);
  });

  it("requires progressive launch movement instead of jumping from intake to scale", () => {
    expect(getAllowedClientLifecycleTransitions("INTAKE")).toContain("ACCESS_PENDING");
    expect(getAllowedClientLifecycleTransitions("INTAKE")).toContain("AUDIT");
    expect(getAllowedClientLifecycleTransitions("INTAKE")).not.toContain("SCALING");
    expect(getAllowedClientLifecycleTransitions("STRATEGY_READY")).toContain("LAUNCHING");
    expect(getAllowedClientLifecycleTransitions("LAUNCHING")).toContain("LEARNING");
  });

  it("supports recovery paths while keeping offboarding terminal", () => {
    expect(getAllowedClientLifecycleTransitions("AT_RISK")).toContain("AUDIT");
    expect(getAllowedClientLifecycleTransitions("AT_RISK")).toContain("TRACKING_REPAIR");
    expect(getAllowedClientLifecycleTransitions("PAUSED")).toContain("OPTIMIZING");
    expect(getAllowedClientLifecycleTransitions("OFFBOARDING")).toEqual([]);
  });
});
