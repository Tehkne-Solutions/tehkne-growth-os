import type { UnifiedOnboardingReadiness } from "@/modules/growth-onboarding/connection-readiness";
import type { ProductionReadinessSnapshot } from "@/modules/growth-operations/production-readiness";

export type ReleaseCapabilityState =
  | "CERTIFIED"
  | "READY_TO_CONNECT"
  | "PENDING_EXTERNAL"
  | "DEGRADED"
  | "BLOCKED";

export type ReleaseCapability = Readonly<{
  key: "CORE" | "OPERATIONS" | "GOOGLE_ADS" | "META_ADS" | "HUBSPOT";
  label: string;
  state: ReleaseCapabilityState;
  detail: string;
}>;

export type ReleaseCapabilityMatrix = Readonly<{
  strictProductionReady: boolean;
  coreCertified: boolean;
  externallyPending: number;
  capabilities: readonly ReleaseCapability[];
}>;

const CORE_CHECK_KEYS = new Set([
  "session",
  "vault",
  "scheduler-secret",
  "app-url",
  "connector-errors",
]);

export function buildReleaseCapabilityMatrix(
  onboarding: UnifiedOnboardingReadiness,
  production: ProductionReadinessSnapshot,
): ReleaseCapabilityMatrix {
  const coreChecks = production.checks.filter((check) => CORE_CHECK_KEYS.has(check.key));
  const coreFailed = coreChecks.some((check) => check.status === "fail");
  const coreWarning = coreChecks.some((check) => check.status === "warning");
  const coreState: ReleaseCapabilityState = coreFailed ? "BLOCKED" : coreWarning ? "DEGRADED" : "CERTIFIED";

  const scheduler = production.checks.find((check) => check.key === "scheduler-pulse");
  const webhook = production.checks.find((check) => check.key === "operations-webhook");
  const operationsState: ReleaseCapabilityState = scheduler?.status === "fail"
    ? "BLOCKED"
    : scheduler?.status === "pass" && webhook?.status === "pass"
      ? "CERTIFIED"
      : "DEGRADED";

  const providerCapabilities = onboarding.providers.map<ReleaseCapability>((provider) => {
    if (provider.firstSyncVerified) {
      return {
        key: provider.provider,
        label: provider.label,
        state: "CERTIFIED",
        detail: "Infraestrutura, conexão ACTIVE e primeira sincronização verificadas.",
      };
    }
    if (!provider.infrastructureReady) {
      return {
        key: provider.provider,
        label: provider.label,
        state: "PENDING_EXTERNAL",
        detail: provider.missing.length > 0
          ? `Pendente configuração externa: ${provider.missing.join(", ")}.`
          : "Pendente configuração externa.",
      };
    }
    if (provider.activeConnectionCount === 0) {
      return {
        key: provider.provider,
        label: provider.label,
        state: "READY_TO_CONNECT",
        detail: "Infraestrutura pronta; falta conectar uma conta real e executar a primeira sincronização.",
      };
    }
    return {
      key: provider.provider,
      label: provider.label,
      state: "DEGRADED",
      detail: `${provider.verifiedConnectionCount}/${provider.activeConnectionCount} conexões ACTIVE verificadas por first-sync.`,
    };
  });

  const capabilities: ReleaseCapability[] = [
    {
      key: "CORE",
      label: "Growth OS Core",
      state: coreState,
      detail: coreState === "CERTIFIED"
        ? "Sessão, vault, scheduler secret, URL pública e integridade de conectores passaram nos checks críticos."
        : "Existe pelo menos um check crítico de plataforma que exige correção antes do release.",
    },
    {
      key: "OPERATIONS",
      label: "Operations & Observability",
      state: operationsState,
      detail: scheduler?.detail ?? "Pulso do scheduler ainda não disponível.",
    },
    ...providerCapabilities,
  ];

  return {
    strictProductionReady: onboarding.productionReady && production.status === "ready",
    coreCertified: coreState === "CERTIFIED",
    externallyPending: capabilities.filter((item) => item.state === "PENDING_EXTERNAL").length,
    capabilities,
  };
}
