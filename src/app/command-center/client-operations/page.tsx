import { cookies } from "next/headers";

import {
  getAllowedClientLifecycleTransitions,
  loadAuthorizedClientOperationsSnapshot,
  type ClientOperationsSnapshot,
} from "@/modules/client-operations/client-profile";
import {
  loadAuthorizedClientHandoverChecklist,
  type ClientHandoverChecklist,
} from "@/modules/client-operations/handover-checklist";
import {
  loadAuthorizedClientTrackingHealth,
  type ClientTrackingHealth,
} from "@/modules/client-operations/tracking-health";
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

import { ClientOperationsForm } from "./client-operations-form";
import { HandoverChecklist } from "./handover-checklist";
import { TrackingHealthPanel } from "./tracking-health-panel";
import styles from "./client-operations.module.css";

type SearchValue = string | string[] | undefined;
type PageProps = { searchParams: Promise<Record<string, SearchValue>> };
type ExplicitTenant = { operatorOrganizationId: string; clientOrganizationId: string; brandId?: string; workspaceId: string };

type PageState =
  | { kind: "context-required" }
  | { kind: "authentication-required" }
  | { kind: "forbidden" }
  | { kind: "unavailable" }
  | {
      kind: "ready";
      tenant: ExplicitTenant;
      snapshot: ClientOperationsSnapshot;
      handover: ClientHandoverChecklist;
      trackingHealth: ClientTrackingHealth;
      workspaceName: string;
      clientName: string;
      brandName: string | null;
      currency: string;
      backQuery: string;
    };

export default async function ClientOperationsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const state = await resolveState(params);

  switch (state.kind) {
    case "context-required": return <StatePage title="Contexto incompleto" detail="Abra um workspace autorizado antes de acessar o Client Operations." />;
    case "authentication-required": return <StatePage title="Autenticação necessária" detail="Entre novamente no Tehkné Growth OS." />;
    case "forbidden": return <StatePage title="Acesso não autorizado" detail="Sua membership não concede leitura deste workspace." />;
    case "unavailable": return <StatePage title="Client Operations indisponível" detail="Não foi possível carregar intake/handover/tracking. Se este release acabou de ser publicado, confirme as migrations Production antes de usar esta área." />;
    case "ready": return <ReadyPage state={state} />;
  }
}

async function resolveState(params: Record<string, SearchValue>): Promise<PageState> {
  const tenant = readTenant(params);
  if (!tenant) return { kind: "context-required" };

  try {
    const environment = parseServerEnvironment(process.env);
    const secret = requireSessionSecret(environment);
    const cookieStore = await cookies();
    const token = cookieStore.get(getSessionCookieName(environment.NODE_ENV))?.value;
    if (!token) throw new InvalidSessionError();

    const database = getDatabase();
    const repository = new PrismaIdentityRepository(database);
    const session = await validateSession(repository, token, secret);
    const parsedTenant = parseTenantContext(tenant);
    const [snapshot, handover, trackingHealth] = await Promise.all([
      loadAuthorizedClientOperationsSnapshot(
        { database, authorizationStore: repository },
        { userId: session.userId, tenant: parsedTenant },
      ),
      loadAuthorizedClientHandoverChecklist(
        { database, authorizationStore: repository },
        { userId: session.userId, tenant: parsedTenant },
      ),
      loadAuthorizedClientTrackingHealth(
        { database, authorizationStore: repository },
        { userId: session.userId, tenant: parsedTenant },
      ),
    ]);
    const workspace = await database.workspace.findFirst({
      where: {
        id: tenant.workspaceId,
        operatorOrganizationId: tenant.operatorOrganizationId,
        clientOrganizationId: tenant.clientOrganizationId,
        status: "ACTIVE",
      },
      select: {
        name: true,
        clientOrganization: { select: { name: true, currency: true } },
        brand: { select: { name: true } },
      },
    });
    if (!workspace) return { kind: "forbidden" };

    return {
      kind: "ready",
      tenant,
      snapshot,
      handover,
      trackingHealth,
      workspaceName: workspace.name,
      clientName: workspace.clientOrganization.name,
      brandName: workspace.brand?.name ?? null,
      currency: workspace.clientOrganization.currency ?? "BRL",
      backQuery: buildBackQuery(params, tenant),
    };
  } catch (error) {
    if (error instanceof InvalidSessionError) return { kind: "authentication-required" };
    if (error instanceof AuthorizationDeniedError) return { kind: "forbidden" };
    return { kind: "unavailable" };
  }
}

function ReadyPage({ state }: Readonly<{ state: Extract<PageState, { kind: "ready" }> }>) {
  const profile = state.snapshot.profile;
  const allowedTransitions = profile ? getAllowedClientLifecycleTransitions(profile.lifecycleState) : [];
  const handoverEntries = state.handover.entries.map((entry) => ({
    ...entry,
    verifiedAt: entry.verifiedAt?.toISOString() ?? null,
  }));
  const trackingEntries = state.trackingHealth.entries.map((entry) => ({
    ...entry,
    assessedAt: entry.assessedAt?.toISOString() ?? null,
  }));

  return <main className={styles.page}>
    <header className={styles.header}>
      <div>
        <p className={styles.eyebrow}>Tehkné Growth OS · Client Operations</p>
        <h1>{state.clientName}</h1>
        <p>{state.brandName ? `${state.brandName} · ` : ""}{state.workspaceName}. Intake, lifecycle, handover e tracking auditáveis sem misturar governança com mutações de mídia.</p>
      </div>
      <a className={styles.backLink} href={`/command-center?${state.backQuery}`}>Voltar ao Command Center</a>
    </header>

    <section className={styles.summary} aria-label="Resumo do cliente">
      <article><span>Lifecycle</span><strong>{humanize(profile?.lifecycleState ?? "INTAKE")}</strong></article>
      <article><span>North Star</span><strong>{profile?.northStarMetricId ?? "Não definida"}</strong></article>
      <article><span>Budget mensal</span><strong>{formatMoney(profile?.monthlyMediaBudget ?? null, profile?.financialCurrency ?? state.currency)}</strong></article>
      <article><span>Handover</span><strong>{state.handover.complete ? "COMPLETE" : `${state.handover.verifiedCount}/${state.handover.entries.length} VERIFIED`}</strong></article>
      <article><span>Tracking</span><strong>{state.trackingHealth.overallStatus}</strong></article>
    </section>

    <ClientOperationsForm tenant={state.tenant} profile={profile} defaultCurrency={state.currency} allowedTransitions={allowedTransitions} />

    <HandoverChecklist
      tenant={state.tenant}
      entries={handoverEntries}
      complete={state.handover.complete}
      verifiedCount={state.handover.verifiedCount}
      notApplicableCount={state.handover.notApplicableCount}
      blockedCount={state.handover.blockedCount}
    />

    <TrackingHealthPanel
      tenant={state.tenant}
      entries={trackingEntries}
      overallStatus={state.trackingHealth.overallStatus}
      healthyCount={state.trackingHealth.healthyCount}
      degradedCount={state.trackingHealth.degradedCount}
      brokenCount={state.trackingHealth.brokenCount}
    />

    <section className={styles.timeline}>
      <p className={styles.eyebrow}>Lifecycle History</p>
      <h2>Transições registradas</h2>
      {state.snapshot.transitions.length === 0 ? <div className={styles.empty}>Nenhuma transição registrada.</div> : <ol>
        {state.snapshot.transitions.map((transition) => <li key={transition.id}>
          <strong>{transition.fromState ? `${humanize(transition.fromState)} → ` : ""}{humanize(transition.toState)}</strong>
          <p>{transition.reason}</p>
          <time dateTime={transition.occurredAt.toISOString()}>{formatDateTime(transition.occurredAt)}</time>
        </li>)}
      </ol>}
    </section>
  </main>;
}

function StatePage({ title, detail }: Readonly<{ title: string; detail: string }>) {
  return <main className={styles.page}><section className={styles.stateCard}><p className={styles.eyebrow}>Tehkné Growth OS</p><h1>{title}</h1><p>{detail}</p></section></main>;
}

function readTenant(params: Record<string, SearchValue>): ExplicitTenant | null {
  const operatorOrganizationId = first(params.operatorOrganizationId);
  const clientOrganizationId = first(params.clientOrganizationId);
  const workspaceId = first(params.workspaceId);
  const brandId = first(params.brandId);
  if (!operatorOrganizationId || !clientOrganizationId || !workspaceId) return null;
  return brandId ? { operatorOrganizationId, clientOrganizationId, workspaceId, brandId } : { operatorOrganizationId, clientOrganizationId, workspaceId };
}

function buildBackQuery(params: Record<string, SearchValue>, tenant: ExplicitTenant) {
  const query = new URLSearchParams({
    operatorOrganizationId: tenant.operatorOrganizationId,
    clientOrganizationId: tenant.clientOrganizationId,
    workspaceId: tenant.workspaceId,
  });
  if (tenant.brandId) query.set("brandId", tenant.brandId);
  const from = first(params.from); const to = first(params.to);
  if (from) query.set("from", from); if (to) query.set("to", to);
  return query.toString();
}

function first(value: SearchValue): string | undefined { return Array.isArray(value) ? value[0]?.trim() || undefined : value?.trim() || undefined; }
function humanize(value: string) { return value.replaceAll("_", " "); }
function formatMoney(value: number | null, currency: string) { return value === null ? "Não informado" : new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(value); }
function formatDateTime(value: Date) { return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(value); }
