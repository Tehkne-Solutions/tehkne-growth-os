import { describe, expect, it } from "vitest";

import { buildProviderCertificationHandoffPack } from "@/modules/growth-operations/provider-certification-handoff";

const provider = (
  provider: "GOOGLE_ADS" | "META_ADS" | "HUBSPOT",
  overrides: Record<string, unknown> = {},
) => ({
  provider,
  label: provider === "GOOGLE_ADS" ? "Google Ads" : provider === "META_ADS" ? "Meta Ads" : "HubSpot",
  infrastructureReady: true,
  connectionCount: 1,
  activeConnectionCount: 1,
  verifiedConnectionCount: 1,
  firstSyncVerified: true,
  configured: true,
  status: "VERIFIED" as const,
  missing: [],
  nextAction: "Monitorar freshness e operação",
  ...overrides,
});

const production = (status: "ready" | "degraded" | "blocked" = "ready") => ({
  status,
  firstSync: { paidMediaActive: 2, paidMediaVerified: 2, crmActive: 1, crmVerified: 1 },
  checks: [],
});

describe("provider certification handoff pack", () => {
  it("keeps external credentials explicit and stage-based", () => {
    const pack = buildProviderCertificationHandoffPack(
      {
        providers: [
          provider("GOOGLE_ADS", {
            infrastructureReady: false,
            connectionCount: 0,
            activeConnectionCount: 0,
            verifiedConnectionCount: 0,
            firstSyncVerified: false,
            configured: false,
            status: "ACTION_REQUIRED",
            missing: ["Google Ads Developer Token (vault)", "Google OAuth Client (vault)"],
          }),
          provider("META_ADS", {
            connectionCount: 0,
            activeConnectionCount: 0,
            verifiedConnectionCount: 0,
            firstSyncVerified: false,
            status: "READY",
          }),
          provider("HUBSPOT", {
            verifiedConnectionCount: 0,
            firstSyncVerified: false,
            status: "CONNECTED",
          }),
        ],
        totalProviders: 3,
        connectedProviders: 1,
        verifiedProviders: 0,
        completionPercent: 0,
        productionReady: false,
      },
      production("degraded"),
    );

    expect(pack.readyForFullCertification).toBe(false);
    expect(pack.providers.map((item) => [item.provider, item.stage])).toEqual([
      ["GOOGLE_ADS", "CREDENTIALS_REQUIRED"],
      ["META_ADS", "READY_TO_CONNECT"],
      ["HUBSPOT", "FIRST_SYNC_REQUIRED"],
    ]);
    expect(pack.providers[0]?.blockingInputs).toContain("Google Ads Developer Token (vault)");
    expect(pack.signature).toBe("Tehkné Solutions");
  });

  it("only permits full certification when all providers and production are ready", () => {
    const onboarding = {
      providers: [provider("GOOGLE_ADS"), provider("META_ADS"), provider("HUBSPOT")],
      totalProviders: 3,
      connectedProviders: 3,
      verifiedProviders: 3,
      completionPercent: 100,
      productionReady: true,
    };

    const pack = buildProviderCertificationHandoffPack(onboarding, production("ready"));
    expect(pack.readyForFullCertification).toBe(true);
    expect(pack.certifiedProviders).toBe(3);
    expect(pack.providers.every((item) => item.stage === "CERTIFIED")).toBe(true);
    expect(pack.finalActions.at(-1)).toContain("Full Production Certification 1.0");
  });
});
