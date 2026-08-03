import type { SectorPackManifest } from "@/modules/sector-packs/types";
import { materializeAttributedCampaignRevenue } from "@/modules/growth-attribution/capture";
import { withConnectorRetry, type ConnectorRetryPolicy } from "@/modules/growth-connectors/operations-policy";
import type { SecretProvider } from "@/modules/growth-connectors/secret-provider";
import type { DatabaseClient } from "@/shared/db/client";

import { materializeFullFunnelMetrics } from "./full-funnel-metrics";
import { HubSpotCrmAdapter } from "./hubspot-adapter";
import { resolveHubSpotDealContactAssociations } from "./hubspot-associations";
import { syncCrmFunnel, type CrmSyncResult } from "./sync-service";
import type { CrmConnection, CrmProvider, ReadOnlyCrmAdapter } from "./types";

export interface CrmTokenRefresher {
  provider: CrmProvider;
  refresh(input: Readonly<{ refreshToken: string }>): Promise<Readonly<{
    accessToken: string;
    refreshToken?: string;
    expiresAt?: Date;
  }>>;
}

export type ScheduledCrmResult = Readonly<{
  connectionId: string;
  workspaceId: string;
  provider: CrmProvider;
  ok: boolean;
  attempts: number;
  sync: CrmSyncResult | null;
  associationsLinked: number;
  metricsWritten: number;
  attributionCampaigns: number;
  error: string | null;
}>;

export async function listDueCrmConnections(
  database: DatabaseClient,
  now = new Date(),
  dueAfterMinutes = 180,
): Promise<CrmConnection[]> {
  const cutoff = new Date(now.getTime() - dueAfterMinutes * 60_000);
  const rows = await database.$queryRaw<Array<CrmConnection>>`
    SELECT
      id,
      workspace_id AS "workspaceId",
      provider,
      external_account_id AS "externalAccountId",
      display_name AS "displayName",
      status,
      secret_ref AS "secretRef",
      settings,
      cursor,
      watermark,
      last_success_at AS "lastSuccessAt",
      last_attempt_at AS "lastAttemptAt",
      consecutive_failures AS "consecutiveFailures"
    FROM growth_crm_connections
    WHERE status = 'ACTIVE'
      AND (last_success_at IS NULL OR last_success_at <= ${cutoff})
    ORDER BY COALESCE(last_success_at, created_at) ASC
  `;
  return rows;
}

export async function runDueCrmSyncs(dependencies: Readonly<{
  database: DatabaseClient;
  secrets: SecretProvider;
  resolveAdapter(provider: CrmProvider): ReadOnlyCrmAdapter;
  resolveRefresher(provider: CrmProvider): CrmTokenRefresher | null;
  resolveSectorPack(workspaceId: string): Promise<SectorPackManifest>;
  resolveQualifiedStages?(workspaceId: string, sectorPack: SectorPackManifest): Promise<ReadonlySet<string>>;
  resolveCurrency?(workspaceId: string): Promise<string>;
  retryPolicy?: ConnectorRetryPolicy;
  sleep?: (delayMs: number) => Promise<void>;
  fetchImpl?: typeof fetch;
}>, input: Readonly<{
  now?: Date;
  dueAfterMinutes?: number;
  limit?: number;
  deadlineAt?: Date;
  metricLookbackDays?: number;
}> = {}): Promise<ScheduledCrmResult[]> {
  const now = input.now ?? new Date();
  const due = await listDueCrmConnections(dependencies.database, now, input.dueAfterMinutes ?? 180);
  const selected = due.slice(0, input.limit ?? 20);
  const results: ScheduledCrmResult[] = [];

  for (const connection of selected) {
    if (input.deadlineAt && Date.now() >= input.deadlineAt.getTime()) break;
    let attempts = 0;
    try {
      if (!connection.secretRef) throw new Error("CRM connection has no secret reference.");
      await ensureFreshCrmToken({
        connection,
        secrets: dependencies.secrets,
        refresher: dependencies.resolveRefresher(connection.provider),
        now,
      });
      const sectorPack = await dependencies.resolveSectorPack(connection.workspaceId);
      const adapter = connection.provider === "HUBSPOT"
        ? new HubSpotCrmAdapter({
            ...(dependencies.fetchImpl ? { fetchImpl: dependencies.fetchImpl } : {}),
            ...(connection.settings?.attributionProperties ? { attributionProperties: connection.settings.attributionProperties } : {}),
          })
        : dependencies.resolveAdapter(connection.provider);
      const sync = await withConnectorRetry(
        async (attempt) => {
          attempts = attempt;
          return syncCrmFunnel(
            {
              database: dependencies.database,
              secrets: dependencies.secrets,
              adapter,
            },
            {
              connection,
              sectorPack: { id: sectorPack.id, version: sectorPack.version, eventTypes: new Set(sectorPack.events) },
              now,
            },
          );
        },
        {
          ...(dependencies.retryPolicy ? { policy: dependencies.retryPolicy } : {}),
          ...(dependencies.sleep ? { sleep: dependencies.sleep } : {}),
        },
      );

      const token = await dependencies.secrets.get(connection.secretRef);
      const accessToken = token?.accessToken;
      let associationsLinked = 0;
      if (connection.provider === "HUBSPOT" && accessToken) {
        const associationResult = await resolveHubSpotDealContactAssociations({
          database: dependencies.database,
          connection,
          accessToken,
          ...(dependencies.fetchImpl ? { fetchImpl: dependencies.fetchImpl } : {}),
        });
        associationsLinked = associationResult.linked;
      }

      const currency = dependencies.resolveCurrency ? await dependencies.resolveCurrency(connection.workspaceId) : "BRL";
      const qualifiedStages = dependencies.resolveQualifiedStages
        ? await dependencies.resolveQualifiedStages(connection.workspaceId, sectorPack)
        : new Set<string>();
      const lookbackDays = Math.max(1, Math.min(input.metricLookbackDays ?? 30, 365));
      const periodStart = new Date(now.getTime() - lookbackDays * 86_400_000);
      const metrics = await materializeFullFunnelMetrics({
        database: dependencies.database,
        workspaceId: connection.workspaceId,
        sectorPack,
        periodStart,
        periodEnd: now,
        currency,
        qualifiedStages,
      });
      const attribution = await materializeAttributedCampaignRevenue(dependencies.database, {
        workspaceId: connection.workspaceId,
        from: periodStart,
        to: now,
      });

      results.push({
        connectionId: connection.id,
        workspaceId: connection.workspaceId,
        provider: connection.provider,
        ok: true,
        attempts,
        sync,
        associationsLinked,
        metricsWritten: metrics.written,
        attributionCampaigns: attribution.campaigns,
        error: null,
      });
    } catch (error) {
      results.push({
        connectionId: connection.id,
        workspaceId: connection.workspaceId,
        provider: connection.provider,
        ok: false,
        attempts: Math.max(1, attempts),
        sync: null,
        associationsLinked: 0,
        metricsWritten: 0,
        attributionCampaigns: 0,
        error: error instanceof Error ? error.message : "Unknown CRM scheduler error",
      });
    }
  }
  return results;
}

async function ensureFreshCrmToken(input: Readonly<{
  connection: CrmConnection;
  secrets: SecretProvider;
  refresher: CrmTokenRefresher | null;
  now: Date;
}>): Promise<void> {
  if (!input.connection.secretRef) throw new Error("CRM connection has no secret reference.");
  const payload = await input.secrets.get(input.connection.secretRef);
  const accessToken = payload?.accessToken;
  if (!accessToken) throw new Error("CRM access token is unavailable.");
  const expiresAt = payload.expiresAt ? new Date(payload.expiresAt) : null;
  if (!expiresAt || expiresAt.getTime() - input.now.getTime() > 5 * 60_000) return;
  if (!input.refresher) throw new Error("CRM token is expiring and no token refresher is configured.");
  const refreshToken = payload.refreshToken;
  if (!refreshToken) throw new Error("CRM token is expiring and no refresh token is available.");
  const refreshed = await input.refresher.refresh({ refreshToken });
  await input.secrets.put(input.connection.secretRef, {
    accessToken: refreshed.accessToken,
    refreshToken: refreshed.refreshToken ?? refreshToken,
    ...(refreshed.expiresAt ? { expiresAt: refreshed.expiresAt.toISOString() } : {}),
  });
}
