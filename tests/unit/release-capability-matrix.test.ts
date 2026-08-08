import { describe, expect, it } from "vitest";

import { buildReleaseCapabilityMatrix } from "@/modules/growth-operations/release-capability-matrix";
import type { UnifiedOnboardingReadiness } from "@/modules/growth-onboarding/connection-readiness";
import type { ProductionReadinessSnapshot } from "@/modules/growth-operations/production-readiness";

function onboarding(): UnifiedOnboardingReadiness {
  return {
    totalProviders: 3,
    connectedProviders: 0,
    verifiedProviders: 0,
    completionPercent: 0,
    productionReady: false,
    providers: [
      {
        provider: "GOOGLE_ADS",
        label: "Google Ads",
        infrastructureReady: false,
        connectionCount: 0,
        activeConnectionCount: 0,
        verifiedConnectionCount: 0,
        firstSyncVerified: false,
        configured: false,
        status: "ACTION_REQUIRED",
        missing: ["Google Ads Developer Token (vault)"],
        nextAction: "Completar configuração de infraestrutura",
      },
      {
        provider: "META_ADS",
        label: "Meta Ads",
        infrastructureReady: true,
        connectionCount: 0,
        activeConnectionCount: 0,
        verifiedConnectionCount: 0,
        firstSyncVerified: false,
        configured: true,
        status: "READY",
        missing: [],
        nextAction: "Conectar e selecionar uma conta",
      },
      {
        provider: "HUBSPOT",
        label: "HubSpot",
        infrastructureReady: true,
        connectionCount: 1,
        activeConnectionCount: 1,
        verifiedConnectionCount: 1,
        firstSyncVerified: true,
        configured: true,
        status: "VERIFIED",
        missing: [],
        nextAction: "Monitorar freshness e operação",
      },
    ],
  };
}

function production(): ProductionReadinessSnapshot {
  return {
    status: "degraded",
    firstSync: { paidMediaActive: 0, paidMediaVerified: 0, crmActive: 1, crmVerified: 1 },
    checks: [
      { key: "session", label: "Sessão", status: "pass", detail: "ok" },
      { key: "vault", label: "Vault", status: "pass", detail: "ok" },
      { key: "scheduler-secret", label: "Scheduler", status: "pass", detail: "ok" },
      { key: "app-url", label: "URL", status: "pass", detail: "ok" },
      { key: "connector-errors", label: "Erros", status: "pass", detail: "0" },
      { key: "scheduler-pulse", label: "Pulso", status: "pass", detail: "SUCCEEDED há 1 min." },
      { key: "operations-webhook", label: "Webhook", status: "warning", detail: "missing" },
    ],
  };
}

describe("buildReleaseCapabilityMatrix", () => {
  it("keeps core certified while external credentials remain pending", () => {
    const matrix = buildReleaseCapabilityMatrix(onboarding(), production());
    expect(matrix.coreCertified).toBe(true);
    expect(matrix.strictProductionReady).toBe(false);
    expect(matrix.externallyPending).toBe(1);
    expect(matrix.capabilities.find((item) => item.key === "GOOGLE_ADS")?.state).toBe("PENDING_EXTERNAL");
    expect(matrix.capabilities.find((item) => item.key === "META_ADS")?.state).toBe("READY_TO_CONNECT");
    expect(matrix.capabilities.find((item) => item.key === "HUBSPOT")?.state).toBe("CERTIFIED");
    expect(matrix.capabilities.find((item) => item.key === "OPERATIONS")?.state).toBe("DEGRADED");
  });

  it("fails core certification when a critical production check fails", () => {
    const snapshot = production();
    const blocked: ProductionReadinessSnapshot = {
      ...snapshot,
      status: "blocked",
      checks: snapshot.checks.map((check) => check.key === "vault" ? { ...check, status: "fail" as const } : check),
    };
    const matrix = buildReleaseCapabilityMatrix(onboarding(), blocked);
    expect(matrix.coreCertified).toBe(false);
    expect(matrix.capabilities.find((item) => item.key === "CORE")?.state).toBe("BLOCKED");
  });
});
