import type { DatabaseClient } from "@/shared/db/client";

import { listControlPlaneAlerts, type ConnectorControlPlaneAlert } from "./control-plane";

export type SchedulerRunObservation = Readonly<{
  runId: string;
  triggerSource: "VERCEL_CRON" | "GITHUB_ACTIONS" | "MANUAL_INTERNAL";
  status: "RUNNING" | "SUCCEEDED" | "PARTIAL" | "FAILED" | "SKIPPED_LOCKED" | "BUDGET_EXHAUSTED";
  startedAt: Date;
  finishedAt: Date | null;
  budgetMs: number;
  connectionsSelected: number;
  connectionsSucceeded: number;
  connectionsFailed: number;
  alertCount: number;
}>;

export type ConnectorNotificationCandidate = Readonly<{
  key: string;
  severity: "critical" | "warning";
  connectionId: string;
  workspaceId: string;
  title: string;
  detail: string;
  reason: ConnectorControlPlaneAlert["reason"];
}>;

export type ConnectorOperationsObservability = Readonly<{
  scheduler: Readonly<{
    status: "healthy" | "degraded" | "unknown";
    latestRun: SchedulerRunObservation | null;
    recentRuns: readonly SchedulerRunObservation[];
  }>;
  alerts: readonly ConnectorControlPlaneAlert[];
  notifications: readonly ConnectorNotificationCandidate[];
}>;

export async function loadConnectorOperationsObservability(
  database: DatabaseClient,
  workspaceId: string,
  now = new Date(),
): Promise<ConnectorOperationsObservability> {
  const [schedulerRuns, globalAlerts] = await Promise.all([
    database.$queryRaw<SchedulerRunObservation[]>`
      SELECT
        id AS "runId",
        trigger_source AS "triggerSource",
        status,
        started_at AS "startedAt",
        finished_at AS "finishedAt",
        budget_ms AS "budgetMs",
        connections_selected AS "connectionsSelected",
        connections_succeeded AS "connectionsSucceeded",
        connections_failed AS "connectionsFailed",
        alert_count AS "alertCount"
      FROM growth_connector_scheduler_runs
      ORDER BY started_at DESC
      LIMIT 20
    `,
    listControlPlaneAlerts(database, now),
  ]);

  const alerts = globalAlerts.filter((alert) => alert.workspaceId === workspaceId);
  const latestRun = schedulerRuns[0] ?? null;
  const status = classifySchedulerStatus(latestRun, now);

  return {
    scheduler: { status, latestRun, recentRuns: schedulerRuns },
    alerts,
    notifications: deriveConnectorNotificationCandidates(alerts),
  };
}

export function deriveConnectorNotificationCandidates(
  alerts: readonly ConnectorControlPlaneAlert[],
): ConnectorNotificationCandidate[] {
  return alerts.map((alert) => {
    const critical = alert.reason === "connection_error" || alert.reason === "repeated_failures";
    return {
      key: `${alert.connectionId}:${alert.reason}`,
      severity: critical ? "critical" : "warning",
      connectionId: alert.connectionId,
      workspaceId: alert.workspaceId,
      title: critical
        ? `${alert.displayName} exige ação`
        : `${alert.displayName} precisa de atenção`,
      detail: notificationDetail(alert),
      reason: alert.reason,
    };
  });
}

export function classifySchedulerStatus(
  latestRun: SchedulerRunObservation | null,
  now = new Date(),
): "healthy" | "degraded" | "unknown" {
  if (!latestRun) return "unknown";
  const ageMinutes = Math.max(0, (now.getTime() - latestRun.startedAt.getTime()) / 60_000);
  if (ageMinutes > 360) return "degraded";
  if (latestRun.status === "FAILED" || latestRun.status === "BUDGET_EXHAUSTED") return "degraded";
  return "healthy";
}

function notificationDetail(alert: ConnectorControlPlaneAlert): string {
  switch (alert.reason) {
    case "connection_error":
      return "A conexão está em estado ERROR e precisa ser revisada antes da próxima ingestão.";
    case "repeated_failures":
      return `${alert.consecutiveFailures} falhas consecutivas foram registradas. Revise autenticação, limites e resposta do provedor.`;
    case "never_synchronized":
      return "A conexão ainda não possui uma sincronização bem-sucedida.";
    case "stale_data":
      return "Os dados ultrapassaram o limite de freshness e podem não representar a operação atual.";
  }
}
