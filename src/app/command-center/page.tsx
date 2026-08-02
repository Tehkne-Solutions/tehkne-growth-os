import { cookies } from "next/headers";

import {
  AuthorizationDeniedError,
  InvalidSessionError,
  PrismaIdentityRepository,
  validateSession,
} from "@/modules/identity";
import {
  loadAuthorizedCommandCenterSnapshot,
} from "@/modules/command-center/authorized-query";
import type { CommandCenterSnapshot } from "@/modules/command-center/query";
import {
  listAuthorizedCommandCenterWorkspaces,
  type CommandCenterWorkspaceOption,
} from "@/modules/command-center/workspaces";
import { getSessionCookieName } from "@/modules/identity/http/security";
import { parseTenantContext } from "@/modules/tenancy";
import {
  parseServerEnvironment,
  requireSessionSecret,
} from "@/shared/config/env";
import { getDatabase } from "@/shared/db/client";

import styles from "./command-center.module.css";

type SearchValue = string | string[] | undefined;
type CommandCenterPageProps = {
  searchParams: Promise<Record<string, SearchValue>>;
};

type PageState =
  | { kind: "operator-required" }
  | { kind: "authentication-required" }
  | { kind: "forbidden" }
  | { kind: "unavailable" }
  | {
      kind: "workspace-selection";
      operatorOrganizationId: string;
      workspaces: CommandCenterWorkspaceOption[];
      from: string | undefined;
      to: string | undefined;
    }
  | {
      kind: "snapshot";
      operatorOrganizationId: string;
      snapshot: CommandCenterSnapshot;
    };

export default async function CommandCenterPage({
  searchParams,
}: CommandCenterPageProps) {
  const state = await resolvePageState(await searchParams);

  switch (state.kind) {
    case "operator-required":
      return (
        <StatePage
          title="Selecione uma operadora"
          detail="O Command Center começa em um contexto de tenant explícito. Informe a operadora para descobrir apenas os workspaces permitidos pela sua membership."
          code="operatorOrganizationId"
        />
      );
    case "authentication-required":
      return (
        <StatePage
          title="Autenticação necessária"
          detail="Entre no Tehkné Growth OS antes de acessar dados operacionais."
          code="401 · authentication_required"
        />
      );
    case "forbidden":
      return (
        <StatePage
          title="Acesso não autorizado"
          detail="Sua membership atual não concede leitura do Command Center neste workspace."
          code="403 · growth.command_center.read"
        />
      );
    case "unavailable":
      return (
        <StatePage
          title="Command Center indisponível"
          detail="Não foi possível carregar o snapshot persistido deste workspace."
          code="command_center_unavailable"
        />
      );
    case "workspace-selection":
      return (
        <WorkspaceSelectionPage
          operatorOrganizationId={state.operatorOrganizationId}
          workspaces={state.workspaces}
          from={state.from}
          to={state.to}
        />
      );
    case "snapshot":
      return (
        <CommandCenterDashboard
          operatorOrganizationId={state.operatorOrganizationId}
          snapshot={state.snapshot}
        />
      );
  }
}

async function resolvePageState(
  params: Record<string, SearchValue>,
): Promise<PageState> {
  const operatorOrganizationId = first(params.operatorOrganizationId);
  if (!operatorOrganizationId) return { kind: "operator-required" };

  try {
    const environment = parseServerEnvironment(process.env);
    const secret = requireSessionSecret(environment);
    const cookieStore = await cookies();
    const token = cookieStore.get(
      getSessionCookieName(environment.NODE_ENV),
    )?.value;
    if (!token) throw new InvalidSessionError();

    const database = getDatabase();
    const identityRepository = new PrismaIdentityRepository(database);
    const session = await validateSession(identityRepository, token, secret);
    const context = readContext(params, operatorOrganizationId);

    if (!context) {
      const workspaces = await listAuthorizedCommandCenterWorkspaces(
        { database, authorizationStore: identityRepository },
        { userId: session.userId, operatorOrganizationId },
      );
      return {
        kind: "workspace-selection",
        operatorOrganizationId,
        workspaces,
        from: first(params.from),
        to: first(params.to),
      };
    }

    const tenant = parseTenantContext({
      operatorOrganizationId: context.operatorOrganizationId,
      clientOrganizationId: context.clientOrganizationId,
      brandId: context.brandId,
      workspaceId: context.workspaceId,
    });
    const snapshot = await loadAuthorizedCommandCenterSnapshot(
      { database, authorizationStore: identityRepository },
      {
        userId: session.userId,
        tenant,
        from: context.from,
        to: context.to,
      },
    );

    return { kind: "snapshot", operatorOrganizationId, snapshot };
  } catch (error) {
    if (error instanceof InvalidSessionError) {
      return { kind: "authentication-required" };
    }
    if (error instanceof AuthorizationDeniedError) {
      return { kind: "forbidden" };
    }
    return { kind: "unavailable" };
  }
}

function CommandCenterDashboard({
  operatorOrganizationId,
  snapshot,
}: Readonly<{
  operatorOrganizationId: string;
  snapshot: CommandCenterSnapshot;
}>) {
  return (
    <main className={styles.page}>
      <div className={styles.topbar}>
        <div className={styles.brand}>
          <span className={styles.brandMark} />
          Tehkné Growth OS
        </div>
        <a
          className={styles.contextLink}
          href={`/command-center?operatorOrganizationId=${encodeURIComponent(operatorOrganizationId)}`}
        >
          Trocar workspace
        </a>
      </div>

      <section className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>Command Center · dados persistidos</p>
          <h1 className={styles.title}>
            Sinais de Growth em um único contexto operacional.
          </h1>
        </div>
        <div className={styles.period}>
          {formatDate(snapshot.from)} — {formatDate(snapshot.to)}
        </div>
      </section>

      {snapshot.metrics.length > 0 ? (
        <section className={styles.metrics} aria-label="Métricas do período">
          {snapshot.metrics.map((metric) => (
            <article
              className={styles.metricCard}
              key={`${metric.metricId}:${metric.currency ?? "none"}`}
            >
              <p className={styles.metricLabel}>{humanizeMetric(metric.metricId)}</p>
              <p className={styles.metricValue}>
                {formatMetric(metric.value, metric.currency)}
              </p>
            </article>
          ))}
        </section>
      ) : (
        <section className={styles.secondaryGrid}>
          <article className={styles.infoCard}>
            <p className={styles.eyebrow}>Estado vazio</p>
            <h2>Nenhuma métrica neste período.</h2>
            <p>
              O painel não inventa valores. Importe observações canônicas ou
              selecione outro período para visualizar KPIs.
            </p>
          </article>
        </section>
      )}

      <section className={styles.secondaryGrid}>
        <article className={styles.infoCard}>
          <p className={styles.eyebrow}>Eventos</p>
          <h2>{snapshot.eventCount.toLocaleString("pt-BR")} eventos no período</h2>
          <p>
            Contagem derivada somente de eventos persistidos dentro do workspace
            autorizado e da janela selecionada.
          </p>
        </article>

        <article className={styles.infoCard}>
          <p className={styles.eyebrow}>Última importação</p>
          {snapshot.latestImport ? (
            <>
              <h2>{snapshot.latestImport.status}</h2>
              <p>{formatDate(snapshot.latestImport.createdAt)}</p>
              <div className={styles.importStats}>
                <div>
                  <span className={styles.context}>Aceitas</span>
                  <strong>{snapshot.latestImport.acceptedCount}</strong>
                </div>
                <div>
                  <span className={styles.context}>Rejeitadas</span>
                  <strong>{snapshot.latestImport.rejectedCount}</strong>
                </div>
              </div>
            </>
          ) : (
            <>
              <h2>Sem importações</h2>
              <p>Ainda não existe batch persistido para este workspace.</p>
            </>
          )}
        </article>
      </section>

      <footer className={styles.footer}>
        <span>Command Center · Sprint 3</span>
        <span>Tehkné Solutions</span>
      </footer>
    </main>
  );
}

function WorkspaceSelectionPage({
  operatorOrganizationId,
  workspaces,
  from,
  to,
}: Readonly<{
  operatorOrganizationId: string;
  workspaces: readonly CommandCenterWorkspaceOption[];
  from: string | undefined;
  to: string | undefined;
}>) {
  const defaults = defaultPeriod(from, to);

  return (
    <main className={styles.page}>
      <div className={styles.topbar}>
        <div className={styles.brand}>
          <span className={styles.brandMark} />
          Tehkné Growth OS
        </div>
        <span className={styles.context}>Workspace autorizado</span>
      </div>

      <section className={styles.selectorCard}>
        <p className={styles.eyebrow}>Command Center</p>
        <h1 className={styles.selectorTitle}>Escolha onde operar.</h1>
        <p className={styles.selectorCopy}>
          A lista abaixo é derivada das suas memberships ativas e da permissão
          <code> growth.command_center.read</code>.
        </p>

        {workspaces.length > 0 ? (
          <form className={styles.selectorForm} method="GET" action="/command-center">
            <input
              type="hidden"
              name="operatorOrganizationId"
              value={operatorOrganizationId}
            />
            <label className={styles.field}>
              <span>Workspace</span>
              <select name="workspaceContext" required defaultValue="">
                <option value="" disabled>
                  Selecione um workspace
                </option>
                {workspaces.map((workspace) => (
                  <option
                    key={workspace.id}
                    value={encodeWorkspaceContext(workspace)}
                  >
                    {workspace.name}
                  </option>
                ))}
              </select>
            </label>
            <div className={styles.dateGrid}>
              <label className={styles.field}>
                <span>De</span>
                <input type="date" name="from" defaultValue={defaults.from} required />
              </label>
              <label className={styles.field}>
                <span>Até</span>
                <input type="date" name="to" defaultValue={defaults.to} required />
              </label>
            </div>
            <button className={styles.primaryButton} type="submit">
              Abrir Command Center
            </button>
          </form>
        ) : (
          <div className={styles.emptyBox}>
            Nenhum workspace ativo com permissão de leitura foi encontrado nesta
            operadora.
          </div>
        )}
      </section>
    </main>
  );
}

function StatePage({
  title,
  detail,
  code,
}: Readonly<{ title: string; detail: string; code: string }>) {
  return (
    <main className={styles.page}>
      <section className={styles.stateCard}>
        <p className={styles.eyebrow}>Tehkné Growth OS</p>
        <h1>{title}</h1>
        <p>{detail}</p>
        <span className={styles.code}>{code}</span>
      </section>
    </main>
  );
}

function readContext(
  params: Record<string, SearchValue>,
  operatorOrganizationId: string,
) {
  const encodedWorkspace = first(params.workspaceContext);
  const decodedWorkspace = encodedWorkspace
    ? decodeWorkspaceContext(encodedWorkspace)
    : null;
  const clientOrganizationId =
    decodedWorkspace?.clientOrganizationId ?? first(params.clientOrganizationId);
  const workspaceId = decodedWorkspace?.workspaceId ?? first(params.workspaceId);
  const brandId = decodedWorkspace?.brandId ?? first(params.brandId);
  const fromRaw = first(params.from);
  const toRaw = first(params.to);
  if (!clientOrganizationId || !workspaceId || !fromRaw || !toRaw) return null;

  const from = startOfUtcDay(fromRaw);
  const to = endOfUtcDay(toRaw);
  if (!from || !to || to < from) return null;

  return {
    operatorOrganizationId,
    clientOrganizationId,
    workspaceId,
    brandId,
    from,
    to,
  };
}

function encodeWorkspaceContext(workspace: {
  id: string;
  clientOrganizationId: string;
  brandId: string | null;
}) {
  return [workspace.id, workspace.clientOrganizationId, workspace.brandId ?? ""].join(":");
}

function decodeWorkspaceContext(value: string) {
  const [workspaceId, clientOrganizationId, brandId = ""] = value.split(":");
  if (!workspaceId || !clientOrganizationId) return null;
  return {
    workspaceId,
    clientOrganizationId,
    brandId: brandId || undefined,
  };
}

function defaultPeriod(from?: string, to?: string) {
  if (from && to) return { from, to };
  const today = new Date();
  const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  return {
    from: formatInputDate(start),
    to: formatInputDate(today),
  };
}

function startOfUtcDay(value: string): Date | null {
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function endOfUtcDay(value: string): Date | null {
  const date = new Date(`${value}T23:59:59.999Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatInputDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function first(value: SearchValue): string | undefined {
  if (Array.isArray(value)) return value[0]?.trim() || undefined;
  return value?.trim() || undefined;
}

function humanizeMetric(metricId: string): string {
  return metricId.replaceAll("_", " ");
}

function formatMetric(value: number, currency: string | null): string {
  if (currency) {
    try {
      return new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency,
        maximumFractionDigits: 2,
      }).format(value);
    } catch {
      return `${value.toLocaleString("pt-BR")} ${currency}`;
    }
  }
  return value.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(value);
}
