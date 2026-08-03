import type { DatabaseClient } from "@/shared/db/client";

export type ProductionReadinessCheck = Readonly<{
  key: string;
  label: string;
  status: "pass" | "warning" | "fail";
  detail: string;
}>;

export type ProductionReadinessSnapshot = Readonly<{
  status: "ready" | "degraded" | "blocked";
  firstSync: Readonly<{
    paidMediaActive: number;
    paidMediaVerified: number;
    crmActive: number;
    crmVerified: number;
  }>;
  checks: readonly ProductionReadinessCheck[];
}>;

export async function auditProductionReadiness(
  database: DatabaseClient,
  workspaceId: string,
  environment: NodeJS.ProcessEnv,
  now = new Date(),
): Promise<ProductionReadinessSnapshot> {
  const [paidRows, crmRows, schedulerRows] = await Promise.all([
    database.$queryRaw<Array<{ active: number; verified: number; failures: number }>>`
      SELECT
        COUNT(*) FILTER (WHERE c.status = 'ACTIVE')::int AS active,
        COUNT(*) FILTER (
          WHERE c.status = 'ACTIVE'
            AND cp.last_success_at IS NOT NULL
            AND cp.watermark IS NOT NULL
        )::int AS verified,
        COUNT(*) FILTER (WHERE COALESCE(cp.consecutive_failures, 0) >= 3 OR c.status = 'ERROR')::int AS failures
      FROM growth_connector_connections c
      LEFT JOIN growth_connector_checkpoints cp ON cp.connection_id = c.id
      WHERE c.workspace_id = ${workspaceId}::uuid
    `,
    database.$queryRaw<Array<{ active: number; verified: number; failures: number }>>`
      SELECT
        COUNT(*) FILTER (WHERE status = 'ACTIVE')::int AS active,
        COUNT(*) FILTER (
          WHERE status = 'ACTIVE'
            AND last_success_at IS NOT NULL
            AND watermark IS NOT NULL
        )::int AS verified,
        COUNT(*) FILTER (WHERE consecutive_failures >= 3 OR status = 'ERROR')::int AS failures
      FROM growth_crm_connections
      WHERE workspace_id = ${workspaceId}::uuid
    `,
    database.$queryRaw<Array<{ status: string; startedAt: Date }>>`
      SELECT status, started_at AS "startedAt"
      FROM growth_connector_scheduler_runs
      ORDER BY started_at DESC
      LIMIT 1
    `,
  ]);

  const paid = paidRows[0] ?? { active: 0, verified: 0, failures: 0 };
  const crm = crmRows[0] ?? { active: 0, verified: 0, failures: 0 };
  const latestScheduler = schedulerRows[0] ?? null;
  const schedulerAgeMinutes = latestScheduler
    ? Math.max(0, (now.getTime() - latestScheduler.startedAt.getTime()) / 60_000)
    : null;

  const checks: ProductionReadinessCheck[] = [
    envCheck("session", "Sessão de produção", Boolean(environment.SESSION_SECRET), "SESSION_SECRET"),
    envCheck("vault", "Vault criptografado", Boolean(environment.CONNECTOR_SECRET_MASTER_KEY), "CONNECTOR_SECRET_MASTER_KEY"),
    envCheck("scheduler-secret", "Autenticação do scheduler", Boolean(environment.CRON_SECRET), "CRON_SECRET"),
    envCheck("app-url", "URL pública", Boolean(environment.APP_URL), "APP_URL"),
    {
      key: "paid-first-sync",
      label: "Primeira sincronização de mídia",
      status: paid.active === 0 ? "warning" : paid.verified === paid.active ? "pass" : "fail",
      detail: `${paid.verified}/${paid.active} conexões ACTIVE com watermark e sucesso registrados.`,
    },
    {
      key: "crm-first-sync",
      label: "Primeira sincronização CRM",
      status: crm.active === 0 ? "warning" : crm.verified === crm.active ? "pass" : "fail",
      detail: `${crm.verified}/${crm.active} conexões ACTIVE com watermark e sucesso registrados.`,
    },
    {
      key: "scheduler-pulse",
      label: "Pulso do scheduler",
      status: !latestScheduler
        ? "warning"
        : schedulerAgeMinutes !== null && schedulerAgeMinutes > 360
          ? "fail"
          : ["FAILED", "BUDGET_EXHAUSTED"].includes(latestScheduler.status)
            ? "fail"
            : "pass",
      detail: latestScheduler
        ? `${latestScheduler.status} há ${Math.round(schedulerAgeMinutes ?? 0)} min.`
        : "Nenhuma execução registrada.",
    },
    {
      key: "connector-errors",
      label: "Falhas críticas de integração",
      status: paid.failures + crm.failures > 0 ? "fail" : "pass",
      detail: `${paid.failures + crm.failures} conexões em ERROR ou com 3+ falhas consecutivas.`,
    },
    {
      key: "operations-webhook",
      label: "Canal de notificação operacional",
      status: environment.OPERATIONS_ALERT_WEBHOOK_URL ? "pass" : "warning",
      detail: environment.OPERATIONS_ALERT_WEBHOOK_URL
        ? "Webhook operacional configurado."
        : "OPERATIONS_ALERT_WEBHOOK_URL não configurado; alertas permanecem apenas na UI.",
    },
  ];

  const failures = checks.filter((check) => check.status === "fail").length;
  const warnings = checks.filter((check) => check.status === "warning").length;
  return {
    status: failures > 0 ? "blocked" : warnings > 0 ? "degraded" : "ready",
    firstSync: {
      paidMediaActive: paid.active,
      paidMediaVerified: paid.verified,
      crmActive: crm.active,
      crmVerified: crm.verified,
    },
    checks,
  };
}

function envCheck(key: string, label: string, ok: boolean, variable: string): ProductionReadinessCheck {
  return {
    key,
    label,
    status: ok ? "pass" : "fail",
    detail: ok ? `${variable} configurado.` : `${variable} ausente.`,
  };
}
