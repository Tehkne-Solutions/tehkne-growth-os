import type { UnifiedOnboardingReadiness } from "@/modules/growth-onboarding/connection-readiness";
import { buildReleaseCapabilityMatrix } from "@/modules/growth-operations/release-capability-matrix";
import type { ProductionReadinessSnapshot } from "@/modules/growth-operations/production-readiness";
import { CORE_RELEASE_CERTIFICATION } from "@/shared/release/core-certification";

export type OperationalConsoleAlert = Readonly<{
  severity: "critical" | "warning" | "info";
  key: string;
  title: string;
  detail: string;
}>;

export type OperationalReleaseConsole = Readonly<{
  release: typeof CORE_RELEASE_CERTIFICATION;
  deployment: Readonly<{
    sha: string | null;
    environment: string | null;
    productionUrl: string | null;
  }>;
  productionStatus: ProductionReadinessSnapshot["status"];
  strictProductionReady: boolean;
  coreCertified: boolean;
  providersCertified: number;
  providersTotal: number;
  externallyPending: number;
  scheduler: Readonly<{
    status: ProductionReadinessSnapshot["checks"][number]["status"];
    detail: string;
  }>;
  capabilities: ReturnType<typeof buildReleaseCapabilityMatrix>["capabilities"];
  alerts: readonly OperationalConsoleAlert[];
  nextActions: readonly string[];
}>;

export function buildOperationalReleaseConsole(input: Readonly<{
  onboarding: UnifiedOnboardingReadiness;
  production: ProductionReadinessSnapshot;
  environment: NodeJS.ProcessEnv;
}>): OperationalReleaseConsole {
  const matrix = buildReleaseCapabilityMatrix(input.onboarding, input.production);
  const schedulerCheck = input.production.checks.find((check) => check.key === "scheduler-pulse");
  const alerts: OperationalConsoleAlert[] = input.production.checks
    .filter((check) => check.status !== "pass")
    .map((check) => ({
      severity: check.status === "fail" ? "critical" : "warning",
      key: check.key,
      title: check.label,
      detail: check.detail,
    }));

  for (const capability of matrix.capabilities) {
    if (capability.state === "PENDING_EXTERNAL") {
      alerts.push({
        severity: "info",
        key: `external:${capability.key}`,
        title: `${capability.label} · dependência externa`,
        detail: capability.detail,
      });
    }
  }

  const nextActions: string[] = [];
  if (!matrix.coreCertified) nextActions.push("Corrigir os checks críticos do Core antes de qualquer promoção de release.");
  if (matrix.capabilities.find((item) => item.key === "OPERATIONS")?.state !== "CERTIFIED") {
    nextActions.push("Fechar pendências de Operations & Observability, incluindo scheduler e canal operacional.");
  }
  for (const capability of matrix.capabilities) {
    if (["GOOGLE_ADS", "META_ADS", "HUBSPOT"].includes(capability.key) && capability.state !== "CERTIFIED") {
      nextActions.push(`${capability.label}: ${capability.detail}`);
    }
  }
  if (matrix.strictProductionReady) nextActions.push("Executar smoke final e promover Full Production Certification 1.0.");

  return {
    release: CORE_RELEASE_CERTIFICATION,
    deployment: {
      sha: input.environment.VERCEL_GIT_COMMIT_SHA ?? null,
      environment: input.environment.VERCEL_ENV ?? null,
      productionUrl: input.environment.VERCEL_PROJECT_PRODUCTION_URL ?? input.environment.APP_URL ?? null,
    },
    productionStatus: input.production.status,
    strictProductionReady: matrix.strictProductionReady,
    coreCertified: matrix.coreCertified,
    providersCertified: input.onboarding.verifiedProviders,
    providersTotal: input.onboarding.totalProviders,
    externallyPending: matrix.externallyPending,
    scheduler: {
      status: schedulerCheck?.status ?? "warning",
      detail: schedulerCheck?.detail ?? "Nenhuma evidência do scheduler disponível.",
    },
    capabilities: matrix.capabilities,
    alerts,
    nextActions,
  };
}
