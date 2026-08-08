import { describe, expect, it } from "vitest";

import { CORE_RELEASE_CERTIFICATION } from "@/shared/release/core-certification";

describe("Production Candidate Core certification", () => {
  it("keeps provider certification explicitly external while certifying the core", () => {
    expect(CORE_RELEASE_CERTIFICATION).toEqual({
      product: "Tehkné Growth OS",
      version: "1.0.0-rc.1-core",
      channel: "PRODUCTION_CANDIDATE_CORE",
      coreStatus: "CERTIFIED",
      providerCertification: "PENDING_EXTERNAL",
      signature: "Tehkné Solutions",
    });
  });
});
