import { describe, expect, it } from "vitest";

import {
  assessReleaseFreezeChange,
  canPromoteFullProduction,
  PRODUCTION_CANDIDATE_FREEZE,
} from "@/modules/growth-operations/release-freeze";

describe("production candidate release freeze", () => {
  it("keeps provider certification work allowed during the freeze", () => {
    expect(PRODUCTION_CANDIDATE_FREEZE.status).toBe("FROZEN");
    expect(PRODUCTION_CANDIDATE_FREEZE.signature).toBe("Tehkné Solutions");
    expect(assessReleaseFreezeChange("PROVIDER_CERTIFICATION").decision).toBe("ALLOWED");
    expect(assessReleaseFreezeChange("DOCUMENTATION").decision).toBe("ALLOWED");
  });

  it("requires explicit review for security and release-blocker fixes", () => {
    expect(assessReleaseFreezeChange("SECURITY_FIX").decision).toBe("REVIEW_REQUIRED");
    expect(assessReleaseFreezeChange("RELEASE_BLOCKER_FIX").requiredEvidence).toContain("plano de rollback confirmado");
  });

  it("blocks new core scope and non-essential schema changes from the RC", () => {
    expect(assessReleaseFreezeChange("CORE_FEATURE").decision).toBe("BLOCKED_FOR_RC");
    expect(assessReleaseFreezeChange("SCHEMA_CHANGE").decision).toBe("BLOCKED_FOR_RC");
    expect(assessReleaseFreezeChange("UNKNOWN").decision).toBe("BLOCKED_FOR_RC");
  });

  it("promotes 1.0 only with all provider and runtime evidence present", () => {
    const ready = {
      strictProductionReady: true,
      providersCertified: 3,
      totalProviders: 3,
      smokePassed: true,
      goldenPathVerified: true,
    };
    expect(canPromoteFullProduction(ready)).toBe(true);
    expect(canPromoteFullProduction({ ...ready, providersCertified: 2 })).toBe(false);
    expect(canPromoteFullProduction({ ...ready, smokePassed: false })).toBe(false);
    expect(canPromoteFullProduction({ ...ready, goldenPathVerified: false })).toBe(false);
  });
});
