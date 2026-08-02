import { describe, expect, it } from "vitest";

import { interpretMetricMovement } from "@/modules/growth-intelligence/semantics";

describe("metric semantic interpretation", () => {
  it("treats upward movement as improvement when direction is up", () => {
    expect(interpretMetricMovement({ currentValue: 120, previousValue: 100, direction: "up" }))
      .toEqual({ movement: "up", outcome: "improved" });
  });

  it("treats upward movement as worsening when direction is down", () => {
    expect(interpretMetricMovement({ currentValue: 25, previousValue: 20, direction: "down" }))
      .toEqual({ movement: "up", outcome: "worsened" });
  });

  it("does not infer quality for contextual metrics", () => {
    expect(interpretMetricMovement({ currentValue: 1200, previousValue: 1000, direction: "contextual" }))
      .toEqual({ movement: "up", outcome: "context-required" });
  });

  it("keeps zero baselines explicit", () => {
    expect(interpretMetricMovement({ currentValue: 4, previousValue: 0, direction: "up" }))
      .toEqual({ movement: "no-baseline", outcome: "no-baseline" });
  });
});
