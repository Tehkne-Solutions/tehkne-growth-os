import { describe, expect, it } from "vitest";

import { summarizeEffectiveness } from "@/modules/growth-intelligence/playbook-effectiveness";

describe("playbook effectiveness summary", () => {
  it("calculates improvement rate only from judged outcomes", () => {
    const summary = summarizeEffectiveness([
      { outcome: "IMPROVED" },
      { outcome: "IMPROVED" },
      { outcome: "WORSENED" },
      { outcome: "CONTEXT_REQUIRED" },
    ]);

    expect(summary.evaluated).toBe(4);
    expect(summary.improved).toBe(2);
    expect(summary.contextRequired).toBe(1);
    expect(summary.improvementRate).toBeCloseTo(66.666, 2);
  });

  it("does not invent an effectiveness rate when all outcomes require context", () => {
    const summary = summarizeEffectiveness([
      { outcome: "CONTEXT_REQUIRED" },
      { outcome: "INSUFFICIENT_DATA" },
    ]);

    expect(summary.improvementRate).toBeNull();
  });
});
