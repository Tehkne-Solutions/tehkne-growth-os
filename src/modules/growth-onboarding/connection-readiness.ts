import type { DatabaseClient } from "@/shared/db/client";

export type ProviderReadiness = Readonly<{
  provider: "GOOGLE_ADS" | "META_ADS" | "HUBSPOT";
  label: string;
  infrastructureReady: boolean;
  connectionCount: number;
  activeConnectionCount: number;
  configured: boolean;
  status: "READY" | "ACTION_REQUIRED" | "CONNECTED";
  missing: readonly string[];
  nextAction: string;
}>;

export type UnifiedOnboardingReadiness = Readonly<{
  providers: readonly ProviderReadiness[];
  totalProviders: number;
  connectedProviders: number;
  completionPercent: number;
  productionReady: boolean;
}>;

export async function loadUnifiedOnboardingReadiness(
  database: DatabaseClient,
  workspaceId: string,
  environment: NodeJS.ProcessEnv,
): Promise<UnifiedOnboardingReadiness> {
  const paidRows = await database.$queryRaw<Array<{ provider: string; total: number; active: number }>>`
    SELECT provider, COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE status = 'ACTIVE')::int AS active
    FROM growth_connector_connections
    WHERE workspace_id = ${workspaceId}::uuid
    GROUP BY provider
  `;
  const crmRows = await database.$queryRaw<Array<{ provider: string; total: number; active: number }>>`
    SELECT provider, COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE status = 'ACTIVE')::int AS active
    FROM growth_crm_connections
    WHERE workspace_id = ${workspaceId}::uuid
    GROUP BY provider
  `;
  const counts = new Map<string, { total: number; active: number }>();
  for (const row of [...paidRows, ...crmRows]) counts.set(row.provider, { total: row.total, active: row.active });

  const masterKeyReady = Boolean(environment.CONNECTOR_SECRET_MASTER_KEY);
  const googleMissing = missing([
    [masterKeyReady, "CONNECTOR_SECRET_MASTER_KEY"],
    [Boolean(environment.GOOGLE_ADS_API_VERSION), "GOOGLE_ADS_API_VERSION"],
    [Boolean(environment.GOOGLE_ADS_DEVELOPER_TOKEN_SECRET_REF), "GOOGLE_ADS_DEVELOPER_TOKEN_SECRET_REF"],
    [Boolean(environment.GOOGLE_ADS_OAUTH_CLIENT_SECRET_REF), "GOOGLE_ADS_OAUTH_CLIENT_SECRET_REF"],
  ]);
  const metaMissing = missing([
    [masterKeyReady, "CONNECTOR_SECRET_MASTER_KEY"],
    [Boolean(environment.META_GRAPH_API_VERSION), "META_GRAPH_API_VERSION"],
    [Boolean(environment.META_ADS_OAUTH_CLIENT_SECRET_REF), "META_ADS_OAUTH_CLIENT_SECRET_REF"],
  ]);
  const hubspotMissing = missing([
    [masterKeyReady, "CONNECTOR_SECRET_MASTER_KEY"],
    [Boolean(environment.HUBSPOT_OAUTH_CLIENT_SECRET_REF || environment.HUBSPOT_PRIVATE_APP_SECRET_REF), "HUBSPOT credential secret ref"],
  ]);

  const providers: ProviderReadiness[] = [
    build("GOOGLE_ADS", "Google Ads", googleMissing, counts.get("GOOGLE_ADS")),
    build("META_ADS", "Meta Ads", metaMissing, counts.get("META_ADS")),
    build("HUBSPOT", "HubSpot", hubspotMissing, counts.get("HUBSPOT")),
  ];
  const connectedProviders = providers.filter((item) => item.activeConnectionCount > 0).length;
  return {
    providers,
    totalProviders: providers.length,
    connectedProviders,
    completionPercent: Math.round((connectedProviders / providers.length) * 100),
    productionReady: providers.every((item) => item.infrastructureReady && item.activeConnectionCount > 0),
  };
}

function build(
  provider: ProviderReadiness["provider"],
  label: string,
  missingItems: readonly string[],
  counts: { total: number; active: number } | undefined,
): ProviderReadiness {
  const active = counts?.active ?? 0;
  const total = counts?.total ?? 0;
  const infrastructureReady = missingItems.length === 0;
  return {
    provider,
    label,
    infrastructureReady,
    connectionCount: total,
    activeConnectionCount: active,
    configured: infrastructureReady,
    status: active > 0 ? "CONNECTED" : infrastructureReady ? "READY" : "ACTION_REQUIRED",
    missing: missingItems,
    nextAction: active > 0 ? "Revisar saúde e sincronização" : infrastructureReady ? "Conectar e selecionar uma conta" : "Completar configuração de infraestrutura",
  };
}

function missing(checks: readonly (readonly [boolean, string])[]): string[] {
  return checks.filter(([ok]) => !ok).map(([, label]) => label);
}
