import { describe, expect, it, vi } from "vitest";

import { loadDeclarativePlaybook } from "@/modules/growth-intelligence/load-playbook";
import {
  buildRollbackRule,
  buildRuleDiff,
  canTransitionPlaybookPublication,
  nextPatchVersion,
} from "@/modules/growth-intelligence/playbook-publishing";
import type { DeclarativePlaybookRule } from "@/modules/growth-intelligence/playbooks";

const baseRule: DeclarativePlaybookRule = {
  id: "cpl-critical-review",
  version: "1.0.0",
  name: "Revisar aquisição quando CPL degrada",
  status: "active",
  priority: 100,
  when: {
    metricId: "cpl",
    severity: "critical",
    performanceMomentum: "worsening",
  },
  action: {
    id: "review-acquisition-efficiency",
    title: "Revisar eficiência de aquisição",
    rationale: "Base",
    checklist: ["Comparar campanhas"],
  },
};

const candidateRule: DeclarativePlaybookRule = {
  ...baseRule,
  version: "1.1.0",
  priority: 110,
  action: {
    ...baseRule.action,
    rationale: "Candidate",
    checklist: ["Comparar campanhas", "Revisar landing page"],
  },
};

describe("governed playbook publishing", () => {
  it("enforces explicit validation before publication", () => {
    expect(canTransitionPlaybookPublication("DRAFT", "VALIDATED")).toBe(true);
    expect(canTransitionPlaybookPublication("DRAFT", "PUBLISHED")).toBe(false);
    expect(canTransitionPlaybookPublication("VALIDATED", "PUBLISHED")).toBe(true);
    expect(canTransitionPlaybookPublication("PUBLISHED", "REJECTED")).toBe(false);
  });

  it("builds a structured diff without mutating the base rule", () => {
    const diff = buildRuleDiff(baseRule, candidateRule);
    expect(diff).toHaveProperty("version");
    expect(diff).toHaveProperty("priority");
    expect(diff).toHaveProperty("action");
    expect(diff).not.toHaveProperty("name");
    expect(baseRule.version).toBe("1.0.0");
  });

  it("creates rollback content from canonical state with a monotonic version", () => {
    const rollback = buildRollbackRule(candidateRule, baseRule);
    expect(nextPatchVersion("1.1.0")).toBe("1.1.1");
    expect(rollback.version).toBe("1.1.1");
    expect(rollback.priority).toBe(baseRule.priority);
    expect(rollback.action.rationale).toBe(baseRule.action.rationale);
    expect(candidateRule.version).toBe("1.1.0");
  });

  it("overlays only published rules for the requested workspace", async () => {
    const database = {
      $queryRaw: vi.fn().mockResolvedValue([
        { ruleId: "cpl-critical-review", candidateRule },
      ]),
    } as never;

    const playbook = await loadDeclarativePlaybook({
      sectorPackId: "education",
      sectorPackVersion: "1.0.0",
      database,
      workspaceId: "33333333-3333-4333-8333-333333333333",
    });

    expect(playbook?.rules.find((rule) => rule.id === "cpl-critical-review")?.version).toBe("1.1.0");
    expect((database as never as { $queryRaw: ReturnType<typeof vi.fn> }).$queryRaw).toHaveBeenCalledOnce();
  });
});
