import { cookies } from "next/headers";

import {
  loadAuthorizedClientPortfolioOverview,
  type ClientPortfolioOverview,
  type ClientPortfolioRow,
} from "@/modules/client-operations/portfolio-overview";
import {
  InvalidSessionError,
  PrismaIdentityRepository,
  validateSession,
} from "@/modules/identity";
import { getSessionCookieName } from "@/modules/identity/http/security";
import { parseServerEnvironment, requireSessionSecret } from "@/shared/config/env";
import { getDatabase } from "@/shared/db/client";

import styles from "./portfolio.module.css";

type SearchValue = string | string[] | undefined;
type PageProps = { searchParams: Promise<Record<string, SearchValue>> };

type State =
  | { kind: "operator-required" }
  | { kind: "authentication-required" }
  | { kind: "unavailable" }
  | { kind: "ready"; operatorOrganizationId: string; overview: ClientPortfolioOverview };

export default async function ClientPortfolioPage({ searchParams }: PageProps) {
  const state = await resolveState(await searchParams);
  if (state.kind !== "ready") {
    const copy = {
      "operator-required": ["Operadora necessária", "Informe a organização operadora para montar o portfólio autorizado."],
      "authentication-required": ["Autenticação necessária", "Entre novamente no Tehkné Growth OS."],
      unavailable: ["Portfólio indisponível", "Não foi possível consolidar a visão multi-cliente. Se Client Operations acabou de ser publicado, confirme as migrations antes de usar este painel."],
    } as const;
    const [title, detail] = copy[state.kind];
    return <main className={styles.page}><section className={styles.state}><p className={styles.eyebrow}>Tehkné Growth OS</p><h1>{title}</h1><p>{detail}</p></section></main>;
  }

  const { overview, operatorOrganizationId } = state;
  return <main className={styles.page}>
    <header className={styles.header}>
      <div>
        <p className={styles.eyebrow}>TKN Growth · Client Portfolio</p>
        <h1>Operação por exceção, não por abas.</h1>
        <p>Workspaces autorizados ordenados pelo que exige atenção. O estado deriva de lifecycle, handover, tracking, conectores e ações humanas já persistidas.</p>
      </div>
      <span className={styles.total}>{overview.rows.length} workspaces</span>
    </header>

    <section className={styles.kpis} aria-label="Resumo de atenção">
      <Kpi label="Critical" value={overview.counts.CRITICAL} state="CRITICAL" />
      <Kpi label="Action required" value={overview.counts.ACTION_REQUIRED} state="ACTION_REQUIRED" />
      <Kpi label="Watch" value={overview.counts.WATCH} state="WATCH" />
      <Kpi label="No action" value={overview.counts.NO_ACTION} state="NO_ACTION" />
    </section>

    {overview.rows.length === 0 ? <section className={styles.empty}><h2>Nenhum workspace autorizado</h2><p>O portfólio respeita as mesmas memberships do Command Center.</p></section> : <section className={styles.grid}>
      {overview.rows.map((row) => <PortfolioCard key={row.workspaceId} row={row} operatorOrganizationId={operatorOrganizationId} />)}
    </section>}

    <footer className={styles.footer}><span>Client Portfolio · P0.4</span><span>Tehkné Solutions</span></footer>
  </main>;
}

async function resolveState(params: Record<string, SearchValue>): Promise<State> {
  const operatorOrganizationId = first(params.operatorOrganizationId);
  if (!operatorOrganizationId) return { kind: "operator-required" };

  try {
    const environment = parseServerEnvironment(process.env);
    const secret = requireSessionSecret(environment);
    const token = (await cookies()).get(getSessionCookieName(environment.NODE_ENV))?.value;
    if (!token) throw new InvalidSessionError();

    const database = getDatabase();
    const repository = new PrismaIdentityRepository(database);
    const session = await validateSession(repository, token, secret);
    const overview = await loadAuthorizedClientPortfolioOverview(
      { database, authorizationStore: repository },
      { userId: session.userId, operatorOrganizationId },
    );
    return { kind: "ready", operatorOrganizationId, overview };
  } catch (error) {
    if (error instanceof InvalidSessionError) return { kind: "authentication-required" };
    return { kind: "unavailable" };
  }
}

function PortfolioCard({ row, operatorOrganizationId }: Readonly<{ row: ClientPortfolioRow; operatorOrganizationId: string }>) {
  const query = new URLSearchParams({
    operatorOrganizationId,
    clientOrganizationId: row.clientOrganizationId,
    workspaceId: row.workspaceId,
  });
  if (row.brandId) query.set("brandId", row.brandId);
  const q = query.toString();

  return <article className={styles.card} data-attention={row.attention}>
    <div className={styles.cardHeader}>
      <div><span>{row.brandName ?? row.workspaceName}</span><h2>{row.clientName}</h2></div>
      <strong>{humanize(row.attention)}</strong>
    </div>
    <div className={styles.metrics}>
      <Metric label="Lifecycle" value={humanize(row.lifecycleState ?? "INTAKE MISSING")} />
      <Metric label="Handover" value={row.handoverComplete ? "COMPLETE" : `${row.handoverVerified}/${Math.max(row.handoverTotal, 13)} VERIFIED`} />
      <Metric label="Tracking" value={row.trackingStatus} />
      <Metric label="Connectors" value={`${row.activeConnectors} ACTIVE · ${row.connectorAlerts} ALERTS`} />
      <Metric label="Actions" value={`${row.openActions} OPEN · ${row.inProgressActions} IN PROGRESS`} />
      <Metric label="Last sync" value={formatDate(row.latestConnectorSuccessAt)} />
    </div>
    <div className={styles.reasons}>
      {row.reasons.length === 0 ? <span>Sem exceção operacional ativa.</span> : row.reasons.map((reason) => <span key={reason}>{humanize(reason)}</span>)}
    </div>
    <div className={styles.links}>
      <a href={`/command-center/client-operations?${q}`}>Client Operations</a>
      <a href={`/command-center?${q}`}>Command Center</a>
      <a href={`/command-center/operations?${q}`}>Release / Ops</a>
    </div>
  </article>;
}

function Kpi({ label, value, state }: Readonly<{ label: string; value: number; state: string }>) {
  return <article data-state={state}><span>{label}</span><strong>{value}</strong></article>;
}
function Metric({ label, value }: Readonly<{ label: string; value: string }>) {
  return <div><span>{label}</span><strong>{value}</strong></div>;
}
function first(value: SearchValue): string | undefined { return Array.isArray(value) ? value[0]?.trim() || undefined : value?.trim() || undefined; }
function humanize(value: string) { return value.replaceAll("_", " "); }
function formatDate(value: Date | null) { return value ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(value) : "NEVER"; }
