import { describe, expect, it } from "vitest";

import {
  experimentEvidenceCaveat,
  getAllowedExperimentTransitions,
  GROWTH_EXPERIMENT_CATEGORIES,
  GROWTH_EXPERIMENT_DESIGNS,
  GROWTH_EXPERIMENT_STATUSES,
} from "@/modules/client-operations/experiment-registry";

describe("growth experiment registry", () => {
  it("keeps the workflow states stable", () => {
    expect(GROWTH_EXPERIMENT_STATUSES).toEqual(["DRAFT", "READY", "RUNNING", "OBSERVING", "CONCLUDED", "CANCELLED"]);
  });

  it("keeps the operating experiment categories explicit", () => {
    expect(GROWTH_EXPERIMENT_CATEGORIES).toContain("CREATIVE");
    expect(GROWTH_EXPERIMENT_CATEGORIES).toContain("CONVERSION_SIGNAL");
    expect(GROWTH_EXPERIMENT_CATEGORIES).toContain("CRM_FOLLOW_UP");
    expect(GROWTH_EXPERIMENT_CATEGORIES).toContain("RETENTION_REACTIVATION");
  });

  it("requires progressive transitions and keeps terminal states terminal", () => {
    expect(getAllowedExperimentTransitions("DRAFT")).toEqual(["READY", "CANCELLED"]);
    expect(getAllowedExperimentTransitions("READY")).toContain("RUNNING");
    expect(getAllowedExperimentTransitions("RUNNING")).toContain("OBSERVING");
    expect(getAllowedExperimentTransitions("OBSERVING")).toContain("CONCLUDED");
    expect(getAllowedExperimentTransitions("CONCLUDED")).toEqual([]);
    expect(getAllowedExperimentTransitions("CANCELLED")).toEqual([]);
  });

  it("never labels observational or before-after evidence as causal", () => {
    expect(experimentEvidenceCaveat("OBSERVATIONAL").toLowerCase()).toContain("não deve ser apresentada como causal");
    expect(experimentEvidenceCaveat("BEFORE_AFTER").toLowerCase()).toContain("não isola causalidade");
  });

  it("keeps controlled designs caveated instead of guaranteeing causality", () => {
    for (const design of ["AB_TEST", "HOLDOUT", "GEO_EXPERIMENT"] as const) {
      const caveat = experimentEvidenceCaveat(design).toLowerCase();
      expect(caveat).toContain("causal");
      expect(caveat).not.toContain("garant");
    }
  });

  it("exposes all supported evidence designs", () => {
    expect(GROWTH_EXPERIMENT_DESIGNS).toEqual(["OBSERVATIONAL", "BEFORE_AFTER", "AB_TEST", "HOLDOUT", "GEO_EXPERIMENT", "OTHER"]);
  });
});
