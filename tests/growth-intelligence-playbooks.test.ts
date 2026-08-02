import { describe, expect, it } from "vitest";

import { derivePlaybookRecommendations } from "@/modules/growth-intelligence/playbook-engine";
import { loadDeclarativePlaybook } from "@/modules/growth-intelligence/load-playbook";

const signal = {
  key: "cpl:BRL",
  metricId: "cpl",
  currency: "BRL",
  severity: "critical" as const,
  priority: 100,
  title: "CPL fora da meta",
  detail: "+20% no período",
};

const series = {
  metricId: "cpl",
  currency: "BRL",
  points: [],
  trend: "rising" as const,
  momentum: "accelerating" as const,
  performanceMomentum: "worsening" as const,
};

describe("declarative playbooks", () => {
  it("loads the real education playbook", async () => {
    const playbook = await loadDeclarativePlaybook({ sectorPackId: "education", sectorPackVersion: "1.0.0" });
    expect(playbook?.rules.some((rule) => rule.id === "cpl-critical-review")).toBe(true);
  });

  it("derives recommendations with evidence", async () => {
    const playbook = await loadDeclarativePlaybook({ sectorPackId: "education", sectorPackVersion: "1.0.0" });
    expect(playbook).not.toBeNull();
    const result = derivePlaybookRecommendations({ playbook: playbook!, signals: [signal], timeSeries: [series] });
    expect(result[0]).toMatchObject({ ruleId: "cpl-critical-review", actionId: "review-acquisition-efficiency", metricId: "cpl" });
    expect(result[0]?.evidence).toContain("momentum=accelerating");
  });
});
