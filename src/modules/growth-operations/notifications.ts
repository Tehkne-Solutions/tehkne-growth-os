import { createHash, randomUUID } from "node:crypto";

import { deriveConnectorNotificationCandidates } from "@/modules/growth-connectors/observability";
import { listControlPlaneAlerts } from "@/modules/growth-connectors/control-plane";
import type { DatabaseClient } from "@/shared/db/client";

export type OperationsNotificationCandidate = Readonly<{
  key: string;
  source: "PAID_MEDIA" | "CRM";
  severity: "critical" | "warning";
  connectionId: string;
  workspaceId: string;
  provider: string;
  title: string;
  detail: string;
  reason: "connection_error" | "repeated_failures" | "never_synchronized" | "stale_data";
}>;

export type OperationsWebhookConfiguration = Readonly<{
  url?: string;
  bearerToken?: string;
}>;

export type OperationsDeliveryResult = Readonly<{
  configured: boolean;
  attempted: number;
  sent: number;
  failed: number;
  deduplicated: number;
}>;

export async function loadUnifiedOperationsNotificationCandidates(
  database: DatabaseClient,
  now = new Date(),
): Promise<OperationsNotificationCandidate[]> {
  const [paidAlerts, crmRows] = await Promise.all([
    listControlPlaneAlerts(database, now),
    loadCrmAlertRows(database, now),
  ]);

  const paid = deriveConnectorNotificationCandidates(paidAlerts).map((item) => {
    const alert = paidAlerts.find((candidate) => candidate.connectionId === item.connectionId && candidate.reason === item.reason);
    return {
      key: `paid:${item.key}`,
      source: "PAID_MEDIA" as const,
      severity: item.severity,
      connectionId: item.connectionId,
      workspaceId: item.workspaceId,
      provider: alert?.provider ?? "UNKNOWN",
      title: item.title,
      detail: item.detail,
      reason: item.reason,
    };
  });

  const crm = crmRows.map((row): OperationsNotificationCandidate => {
    const critical = row.reason === "connection_error" || row.reason === "repeated_failures";
    return {
      key: `crm:${row.connectionId}:${row.reason}`,
      source: "CRM",
      severity: critical ? "critical" : "warning",
      connectionId: row.connectionId,
      workspaceId: row.workspaceId,
      provider: row.provider,
      title: critical ? `${row.displayName} exige ação` : `${row.displayName} precisa de atenção`,
      detail: crmNotificationDetail(row),
      reason: row.reason,
    };
  });

  return [...paid, ...crm];
}

export async function deliverOperationsNotifications(
  database: DatabaseClient,
  candidates: readonly OperationsNotificationCandidate[],
  configuration: OperationsWebhookConfiguration,
  now = new Date(),
  fetchImpl: typeof fetch = fetch,
): Promise<OperationsDeliveryResult> {
  const url = configuration.url?.trim();
  if (!url) return { configured: false, attempted: 0, sent: 0, failed: 0, deduplicated: 0 };

  let attempted = 0;
  let sent = 0;
  let failed = 0;
  let deduplicated = 0;

  for (const candidate of candidates) {
    const fingerprint = buildOperationsNotificationFingerprint(candidate, now);
    const deliveryId = randomUUID();
    const inserted = await database.$queryRaw<Array<{ id: string }>>`
      INSERT INTO growth_operations_notification_deliveries (
        id, workspace_id, fingerprint, channel, severity, reason, status, attempts
      ) VALUES (
        ${deliveryId}::uuid, ${candidate.workspaceId}::uuid, ${fingerprint}, 'WEBHOOK',
        ${candidate.severity}, ${candidate.reason}, 'PENDING', 0
      )
      ON CONFLICT (workspace_id, fingerprint, channel) DO NOTHING
      RETURNING id
    `;
    if (!inserted[0]) {
      deduplicated += 1;
      continue;
    }

    attempted += 1;
    try {
      const response = await fetchImpl(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(configuration.bearerToken ? { Authorization: `Bearer ${configuration.bearerToken}` } : {}),
        },
        body: JSON.stringify({
          event: "tehkne_growth_operations_alert",
          signature: "Tehkné Solutions",
          occurredAt: now.toISOString(),
          alert: candidate,
        }),
      });
      if (!response.ok) throw new Error(`Operations webhook failed with HTTP ${response.status}.`);
      await database.$executeRaw`
        UPDATE growth_operations_notification_deliveries
        SET status = 'SENT', attempts = attempts + 1, sent_at = ${now}, last_error = NULL, updated_at = NOW()
        WHERE id = ${inserted[0].id}::uuid
      `;
      sent += 1;
    } catch (error) {
      await database.$executeRaw`
        UPDATE growth_operations_notification_deliveries
        SET status = 'FAILED', attempts = attempts + 1,
            last_error = ${error instanceof Error ? error.message.slice(0, 2000) : "unknown_webhook_error"},
            updated_at = NOW()
        WHERE id = ${inserted[0].id}::uuid
      `;
      failed += 1;
    }
  }

  return { configured: true, attempted, sent, failed, deduplicated };
}

export function buildOperationsNotificationFingerprint(
  candidate: OperationsNotificationCandidate,
  now = new Date(),
): string {
  const bucketMs = 6 * 60 * 60 * 1000;
  const bucket = Math.floor(now.getTime() / bucketMs);
  return createHash("sha256")
    .update([candidate.workspaceId, candidate.key, candidate.severity, String(bucket)].join("|"))
    .digest("hex");
}

type CrmAlertRow = Readonly<{
  connectionId: string;
  workspaceId: string;
  provider: string;
  displayName: string;
  reason: OperationsNotificationCandidate["reason"];
  consecutiveFailures: number;
  lastSuccessAt: Date | null;
}>;

async function loadCrmAlertRows(database: DatabaseClient, now: Date): Promise<CrmAlertRow[]> {
  const staleCutoff = new Date(now.getTime() - 720 * 60_000);
  return database.$queryRaw<CrmAlertRow[]>`
    SELECT
      id AS "connectionId",
      workspace_id AS "workspaceId",
      provider,
      display_name AS "displayName",
      CASE
        WHEN status = 'ERROR' THEN 'connection_error'
        WHEN last_success_at IS NULL THEN 'never_synchronized'
        WHEN consecutive_failures >= 3 THEN 'repeated_failures'
        ELSE 'stale_data'
      END AS reason,
      consecutive_failures AS "consecutiveFailures",
      last_success_at AS "lastSuccessAt"
    FROM growth_crm_connections
    WHERE status IN ('ACTIVE','ERROR')
      AND (
        status = 'ERROR'
        OR last_success_at IS NULL
        OR consecutive_failures >= 3
        OR last_success_at <= ${staleCutoff}
      )
    ORDER BY consecutive_failures DESC, last_success_at ASC NULLS FIRST
    LIMIT 100
  `;
}

function crmNotificationDetail(alert: CrmAlertRow): string {
  switch (alert.reason) {
    case "connection_error":
      return "A conexão CRM está em ERROR e precisa ser revisada antes da próxima ingestão.";
    case "repeated_failures":
      return `${alert.consecutiveFailures} falhas consecutivas foram registradas no CRM.`;
    case "never_synchronized":
      return "A conexão CRM ainda não possui uma primeira sincronização bem-sucedida.";
    case "stale_data":
      return "Os dados CRM ultrapassaram o limite de freshness de 12 horas.";
  }
}
