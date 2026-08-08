import {
  inspectPlatformConnectorSecrets,
  platformConnectorSecretRefsFromEnvironment,
  type PlatformConnectorSecretStatus,
} from "@/modules/growth-onboarding/platform-connector-secrets";
import type { DatabaseClient } from "@/shared/db/client";

export type ProviderReadiness = Readonly<{
  provider: "GOOGLE_ADS" | "META_ADS" | "HUBSPOT";
  label: string;
  infrastructureReady: boolean;
  connectionCount: number;
  activeConnectionCount: number;
  verifiedConnectionCount: number;
  firstSyncVerified: boolean;
  configured: boolean;
  status: "READY" | "ACTION_REQUIRED" | "CONNECTED" | "VERIFIED";
  missing: readonly string[];
  nextAction: string;
}>;

export type UnifiedOnboardingReadiness = Readonly<{
  providers: readonly ProviderReadiness[];
  totalProviders: number;
  connectedProviders: number;
  verifiedProviders: number;
  completionPercent: number;
  productionReady: boolean;
}>;

type Counts = { total: number; active: number; verified: number };

const NO_PLATFORM_SECRETS: PlatformConnectorSecretStatus = Object.freeze({
  googleAdsDeveloperToken: false,
  googleAdsOAuthClient: false,
  metaAdsOAuthClient: false,
});

export async function loadUnifiedOnboardingReadiness(
  database: DatabaseClient,
  workspaceId: string,
  environment: NodeJS.ProcessEnv,
): Promise<UnifiedOnboardingReadiness> {
  const paidRows = await database.$queryRaw<Array<{ provider: string; total: number; active: number; verified: number }>>`
    SELECT c.provider,
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE c.status = 'ACTIVE')::int AS active,
      COUNT(*) FILTER (
        WHERE c.status = 'ACTIVE'
          AND cp.last_success_at IS NOT NULL
          AND cp.watermark IS NOT NULL
      )::int AS verified
    FROM growth_connector_connections c
    LEFT JOIN growth_connector_checkpoints cp ON cp.connection_id = c.id
    WHERE c.workspace_id = ${workspaceId}::uuid
    GROUP BY c.provider
  `;
  const crmRows = await database.$queryRaw<Array<{ provider: string; total: number; active: number; verified: number }>>`
    SELECT provider,
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE status = 'ACTIVE')::int AS active,
      COUNT(*) FILTER (
        WHERE status = 'ACTIVE'
          AND last_success_at IS NOT NULL
          AND watermark IS NOT NULL
      )::int AS verified
    FROM growth_crm_connections
    WHERE workspace_id = ${workspaceId}::uuid
    GROUP BY provider
  `;
  const counts = new Map<string, Counts>();
  for (const row of [...paidRows, ...crmRows]) counts.set(row.provider, row);

  const masterKey = environment.CONNECTOR_SECRET_MASTER_KEY;
  const masterKeyReady = Boolean(masterKey);
  let platformSecrets = NO_PLATFORM_SECRETS;
  if (masterKey) {
    try {
      platformSecrets = await inspectPlatformConnectorSecrets(
        database,
        masterKey,
        platformConnectorSecretRefsFromEnvironment(environment),
      );
    } catch {
      platformSecrets = NO_PLATFORM_SECRETS;
    }
  }

  const googleMissing = missing([
    [masterKeyReady, "CONNECTOR_SECRET_MASTER_KEY"],
    [Boolean(environment.GOOGLE_ADS_API_VERSION), "GOOGLE_ADS_API_VERSION"],
    [platformSecrets.googleAdsDeveloperToken, "Google Ads Developer Token (vault)"],
    [platformSecrets.googleAdsOAuthClient, "Google OAuth Client (vault)"],
  ]);
  const metaMissing = missing([
    [masterKeyReady, "CONNECTOR_SECRET_MASTER_KEY"],
    [Boolean(environment.META_GRAPH_API_VERSION), "META_GRAPH_API_VERSION"],
    [platformSecrets.metaAdsOAuthClient, "Meta OAuth Client (vault)"],
  ]);
  const hubspotMissing = missing([
    [masterKeyReady, "CONNECTOR_SECRET_MASTER_KEY"],
  ]);

  const providers: ProviderReadiness[] = [
    build("GOOGLE_ADS", "Google Ads", googleMissing, counts.get("GOOGLE_ADS")),
    build("META_ADS", "Meta Ads", metaMissing, counts.get("META_ADS")),
    build("HUBSPOT", "HubSpot", hubspotMissing, counts.get("HUBSPOT")),
  ];
  const connectedProviders = providers.filter((item) => item.activeConnectionCount > 0).length;
  const verifiedProviders = providers.filter((item) => item.firstSyncVerified).length;
  return {
    providers,
    totalProviders: providers.length,
    connectedProviders,
    verifiedProviders,
    completionPercent: Math.round((verifiedProviders / providers.length) * 100),
    productionReady: providers.every((item) => item.infrastructureReady && item.firstSyncVerified),
  };
}

function build(
  provider: ProviderReadiness["provider"],
  label: string,
  missingItems: readonly string[],
  counts: Counts | undefined,
): ProviderReadiness {
  const active = counts?.active ?? 0;
  const total = counts?.total ?? 0;
  const verified = counts?.verified ?? 0;
  const infrastructureReady = missingItems.length === 0;
  const firstSyncVerified = active > 0 && verified === active;
  const status: ProviderReadiness["status"] = firstSyncVerified
    ? "VERIFIED"
    : active > 0
      ? "CONNECTED"
      : infrastructureReady
        ? "READY"
        : "ACTION_REQUIRED";
  return {
    provider,
    label,
    infrastructureReady,
    connectionCount: total,
    activeConnectionCount: active,
    verifiedConnectionCount: verified,
    firstSyncVerified,
    configured: infrastructureReady,
    status,
    missing: missingItems,
    nextAction: firstSyncVerified
      ? "Monitorar freshness e operação"
      : active > 0
        ? "Executar e validar a primeira sincronização"
        : infrastructureReady
          ? "Conectar e selecionar uma conta"
          : "Completar configuração de infraestrutura",
  };
}

function missing(checks: readonly (readonly [boolean, string])[]): string[] {
  return checks.filter(([ok]) => !ok).map(([, label]) => label);
}
