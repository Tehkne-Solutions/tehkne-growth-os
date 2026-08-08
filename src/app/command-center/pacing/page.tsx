import { cookies } from "next/headers";

import { loadAuthorizedBudgetPacingWorkspace } from "@/modules/client-operations/budget-pacing";
import {
  AuthorizationDeniedError,
  InvalidSessionError,
  PrismaIdentityRepository,
  validateSession,
} from "@/modules/identity";
import { getSessionCookieName } from "@/modules/identity/http/security";
import { parseTenantContext } from "@/modules/tenancy";
import { parseServerEnvironment, requireSessionSecret } from "@/shared/config/env";
import { getDatabase } from "@/shared/db/client";

import { PacingControls } from "./pacing-controls";
import styles from "./pacing.module.css";

type SearchValue = string | string[] | undefined;
type PageProps = { searchParams: Promise<Record<string, SearchValue>> };
type Tenant = { operatorOrganizationId: string; clientOrganizationId: string; workspaceId: string; brandId?: string };

type State =
  | { kind: "context-required" }
  | { kind: "authentication-required" }
  | { kind: "forbidden" }
  | { kind: "unavailable" }
  | {
      kind: "ready";
      tenant: Tenant;
      clientName: string;
      workspaceName: string;
      defaultCurrency: string;
      workspace: Awaited<ReturnType<typeof loadAuthorizedBudgetPacingWorkspace>>;
    };

export default async function BudgetPacingPage({ searchParams }: PageProps) {
  const state = await resolveState(await searchParams);
  if (state.kind !== "ready") {
    const copy = {
      "context-required": ["Contexto necessário", "Abra Budget Pacing a partir de um workspace válido."],
      "authentication-required": ["Autenticação necessária", "Entre novamente no Tehkné Growth OS."],
      forbidden: ["Acesso não autorizado", "Sua membership não permite ler este workspace."],
      unavailable: ["Budget Pacing indisponível", "Não foi possível carregar pacing/anomalias. Confirme migrations e release antes de usar esta área."],
    } as const;
    const [title, detail] = copy[state.kind];
    return <main className={styles.page}><section className={styles.state}><p className={styles.eyebrow}>Tehkné Growth OS</p><h1>{title}</h1><p>{detail}</p></section></main>;
  }

  const query = new URLSearchParams({
    operatorOrganizationId: state.tenant.operatorOrganizationId,
    clientOrganizationId: state.tenant.clientOrganizationId,
    workspaceId: state.tenant.workspaceId,
  });
  if (state.tenant.brandId) query.set("brandId", state.tenant.brandId);

  const plans = state.workspace.plans.map(({ plan, latestObservation }) => ({
    id: plan.id,
    label: plan.label,
    periodStart: plan.periodStart.toISOString(),
    periodEnd: plan.periodEnd.toISOString(),
    budgetAmount: plan.budgetAmount,
    financialCurrency: plan.financialCurrency,
    warningDeviationPct: plan.warningDeviationPct,
    criticalDeviationPct: plan.criticalDeviationPct,
    status: plan.status,
    latestObservation: latestObservation ? {
      observedAt: latestObservation.observedAt.toISOString(),
      actualSpend: latestObservation.actualSpend,
      elapsedRatio: latestObservation.elapsedRatio,
      expectedSpend: latestObservation.expectedSpend,
      projectedSpend: latestObservation.projectedSpend,
      deviationPct: latestObservation.deviationPct,
      status: latestObservation.status,
      sourceReference: latestObservation.sourceReference,
    } : null,
  }));
  const anomalies = state.workspace.anomalies.map((anomaly) => ({
    id: anomaly.id,
    metricId: anomaly.metricId,
    observedAt: anomaly.observedAt.toISOString(),
    observedValue: anomaly.observedValue,
    baselineValue: anomaly.baselineValue,
    absoluteDelta: anomaly.absoluteDelta,
    deviationPct: anomaly.deviationPct,
    direction: anomaly.direction,
    severity: anomaly.severity,
    evidenceReference: anomaly.evidenceReference,
    acknowledgedAt: anomaly.acknowledgedAt?.toISOString() ?? null,
  }));

  return <main className={styles.page}>
    <header className={styles.header}>
      <div>
        <p className={styles.eyebrow}>TKN Growth · Budget Pacing + Anomalies</p>
        <h1>Desvio visível antes de virar desperdício.</h1>
        <p>{state.clientName} · {state.workspaceName}. Pacing e anomalias são observacionais: o sistema calcula e registra, mas não muda budget nem atribui causalidade.</p>
      </div>
      <div className={styles.navLinks}>
        <a href={`/command-center/strategy?${query.toString()}`}>Strategy</a>
        <a href={`/command-center/experiments?${query.toString()}`}>Experiments</a>
        <a href={`/command-center?${query.toString()}`}>Command Center</a>
      </div>
    </header>
    <PacingControls tenant={state.tenant} plans={plans} anomalies={anomalies} defaultCurrency={state.defaultCurrency} />
    <footer className={styles.footer}><span>Budget Pacing + Performance Anomalies · P1.3</span><span>Tehkné Solutions</span></footer>
  </main>;
}

async function resolveState(params: Record<string, SearchValue>): Promise<State> {
  const tenant = readTenant(params);
  if (!tenant) return { kind: "context-required" };
  try {
    const environment = parseServerEnvironment(process.env);
    const secret = requireSessionSecret(environment);
    const token = (await cookies()).get(getSessionCookieName(environment.NODE_ENV))?.value;
    if (!token) throw new InvalidSessionError();
    const database = getDatabase();
    const repository = new PrismaIdentityRepository(database);
    const session = await validateSession(repository, token, secret);
    const parsedTenant = parseTenantContext(tenant);
    const workspace = await loadAuthorizedBudgetPacingWorkspace({ database, authorizationStore: repository }, { userId: session.userId, tenant: parsedTenant });
    const context = await database.workspace.findFirst({
      where: { id: tenant.workspaceId, operatorOrganizationId: tenant.operatorOrganizationId, clientOrganizationId: tenant.clientOrganizationId, status: "ACTIVE" },
      select: { name: true, clientOrganization: { select: { name: true, currency: true } } },
    });
    if (!context) return { kind: "forbidden" };
    return { kind: "ready", tenant, clientName: context.clientOrganization.name, workspaceName: context.name, defaultCurrency: context.clientOrganization.currency ?? "BRL", workspace };
  } catch (error) {
    if (error instanceof InvalidSessionError) return { kind: "authentication-required" };
    if (error instanceof AuthorizationDeniedError) return { kind: "forbidden" };
    return { kind: "unavailable" };
  }
}

function readTenant(params: Record<string, SearchValue>): Tenant | null {
  const operatorOrganizationId = first(params.operatorOrganizationId);
  const clientOrganizationId = first(params.clientOrganizationId);
  const workspaceId = first(params.workspaceId);
  const brandId = first(params.brandId);
  if (!operatorOrganizationId || !clientOrganizationId || !workspaceId) return null;
  return brandId ? { operatorOrganizationId, clientOrganizationId, workspaceId, brandId } : { operatorOrganizationId, clientOrganizationId, workspaceId };
}
function first(value: SearchValue) { return Array.isArray(value) ? value[0]?.trim() || undefined : value?.trim() || undefined; }
