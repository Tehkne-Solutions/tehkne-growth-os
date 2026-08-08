import { describe, expect, it } from "vitest";

import { buildOperationalReleaseConsole } from "@/modules/growth-operations/operational-release-console";

const provider = (provider: "GOOGLE_ADS" | "META_ADS" | "HUBSPOT", overrides: Record<string, unknown> = {}) => ({
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

const production = (overrides: Record<string, unknown> = {}) => ({
  status: "ready" as const,
  firstSync: { paidMediaActive: 2, paidMediaVerified: 2, crmActive: 1, crmVerified: 1 },
  checks: [
    { key: "session", label: "Sessão de produção", status: "pass" as const, detail: "SESSION_SECRET configurado." },
    { key: "vault", label: "Vault criptografado", status: "pass" as const, detail: "CONNECTOR_SECRET_MASTER_KEY configurado." },
    { key: "scheduler-secret", label: "Autenticação do scheduler", status: "pass" as const, detail: "CRON_SECRET configurado." },
    { key: "app-url", label: "URL pública", status: "pass" as const, detail: "APP_URL configurado." },
    { key: "paid-first-sync", label: "Primeira sincronização de mídia", status: "pass" as const, detail: "2/2 verificadas." },
    { key: "crm-first-sync", label: "Primeira sincronização CRM", status: "pass" as const, detail: "1/1 verificadas." },
    { key: "scheduler-pulse", label: "Pulso do scheduler", status: "pass" as const, detail: "SUCCEEDED há 2 min." },
    { key: "connector-errors", label: "Falhas críticas de integração", status: "pass" as const, detail: "0 conexões críticas." },
    { key: "operations-webhook", label: "Canal de notificação operacional", status: "pass" as const, detail: "Webhook configurado." },
  ],
  ...overrides,
});

describe("operational release console", () => {
  it("represents a fully certified runtime without operational alerts", () => {
    const snapshot = buildOperationalReleaseConsole({
      onboarding: {
        providers: [provider("GOOGLE_ADS"), provider("META_ADS"), provider("HUBSPOT")],
        totalProviders: 3,
        connectedProviders: 3,
        verifiedProviders: 3,
        completionPercent: 100,
        productionReady: true,
      },
      production: production(),
      environment: {
        VERCEL_GIT_COMMIT_SHA: "a".repeat(40),
        VERCEL_ENV: "production",
        VERCEL_PROJECT_PRODUCTION_URL: "tehkne-growth-os.vercel.app",
      },
    });

    expect(snapshot.coreCertified).toBe(true);
    expect(snapshot.strictProductionReady).toBe(true);
    expect(snapshot.providersCertified).toBe(3);
    expect(snapshot.externallyPending).toBe(0);
    expect(snapshot.alerts).toEqual([]);
    expect(snapshot.deployment.sha).toBe("a".repeat(40));
    expect(snapshot.nextActions).toContain("Executar smoke final e promover Full Production Certification 1.0.");
  });

  it("keeps missing provider credentials explicit without degrading certified core", () => {
    const google = provider("GOOGLE_ADS", {
      infrastructureReady: false,
      connectionCount: 0,
      activeConnectionCount: 0,
      verifiedConnectionCount: 0,
      firstSyncVerified: false,
      configured: false,
      status: "ACTION_REQUIRED",
      missing: ["Google Ads Developer Token (vault)", "Google OAuth Client (vault)"],
      nextAction: "Completar configuração de infraestrutura",
    });
    const degradedProduction = production({
      status: "degraded",
      checks: production().checks.map((check) => check.key === "operations-webhook"
        ? { ...check, status: "warning" as const, detail: "OPERATIONS_ALERT_WEBHOOK_URL não configurado." }
        : check),
    });
    const snapshot = buildOperationalReleaseConsole({
      onboarding: {
        providers: [google, provider("META_ADS"), provider("HUBSPOT")],
        totalProviders: 3,
        connectedProviders: 2,
        verifiedProviders: 2,
        completionPercent: 67,
        productionReady: false,
      },
      production: degradedProduction,
      environment: {},
    });

    expect(snapshot.coreCertified).toBe(true);
    expect(snapshot.strictProductionReady).toBe(false);
    expect(snapshot.externallyPending).toBe(1);
    expect(snapshot.alerts.some((alert) => alert.key === "external:GOOGLE_ADS")).toBe(true);
    expect(snapshot.alerts.some((alert) => alert.key === "operations-webhook")).toBe(true);
  });
});
