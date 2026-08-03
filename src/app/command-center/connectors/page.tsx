import { cookies } from "next/headers";

import {
  authorize,
  AuthorizationDeniedError,
  InvalidSessionError,
  PrismaIdentityRepository,
  validateSession,
} from "@/modules/identity";
import { getSessionCookieName } from "@/modules/identity/http/security";
import { loadConnectorOperationsDiagnostics } from "@/modules/growth-connectors/operations-diagnostics";
import { parseTenantContext } from "@/modules/tenancy";
import { parseServerEnvironment, requireSessionSecret } from "@/shared/config/env";
import { getDatabase } from "@/shared/db/client";

import { ManualSyncButton } from "./manual-sync-button";
import styles from "./page.module.css";

type SearchValue = string | string[] | undefined;
type PageProps = { searchParams: Promise<Record<string, SearchValue>> };

type Tenant = {
  operatorOrganizationId: string;
  clientOrganizationId: string;
  brandId?: string;
  workspaceId: string;
};

type State =
  | { kind: "context-required" }
  | { kind: "authentication-required" }
  | { kind: "forbidden" }
  | { kind: "unavailable" }
  | { kind: "ready"; tenant: Tenant; diagnostics: Awaited<ReturnType<typeof loadConnectorOperationsDiagnostics>> };

export default async function ConnectorOperationsPage({ searchParams }: PageProps) {
  const state = await resolveState(await searchParams);
  if (state.kind !== "ready") {
    const labels = {
      "context-required": ["Contexto necessário", "Informe operatorOrganizationId, clientOrganizationId e workspaceId."],
      "authentication-required": ["Autenticação necessária", "Entre no Tehkné Growth OS para operar conectores."],
      forbidden: ["Acesso não autorizado", "Sua membership não possui growth.connectors.manage neste workspace."],
      unavailable: ["Conectores indisponíveis", "Não foi possível carregar o diagnóstico operacional."],
    } as const;
    const [title, detail] = labels[state.kind];
    return <main className={styles.page}><section className={styles.state}><p>Tehkné Growth OS</p><h1>{title}</h1><span>{detail}</span></section></main>;
  }

  const { tenant, diagnostics } = state;
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Connector Operations</p>
          <h1>Saúde, freshness e sincronização por workspace.</h1>
          <p>Operação read-only de Meta Ads e Google Ads. Tokens permanecem no vault criptografado.</p>
        </div>
        <a href={commandCenterHref(tenant)}>Voltar ao Command Center</a>
      </header>

      <section className={styles.grid} aria-label="Conectores">
        {diagnostics.health.length === 0 ? (
          <article className={styles.card}><h2>Nenhum conector configurado</h2><p>Conecte uma conta de mídia para iniciar a ingestão automática.</p></article>
        ) : diagnostics.health.map(({ connection, health }) => (
          <article className={styles.card} key={connection.id}>
            <div className={styles.cardHeader}>
              <div>
                <p className={styles.provider}>{formatProvider(connection.provider)}</p>
                <h2>{connection.displayName}</h2>
                <span>{connection.externalAccountId}</span>
              </div>
              <span className={styles.badge} data-status={health.status}>{health.status}</span>
            </div>
            <dl className={styles.stats}>
              <div><dt>Status</dt><dd>{connection.status}</dd></div>
              <div><dt>Watermark</dt><dd>{formatDateTime(connection.checkpoint?.watermark ?? null)}</dd></div>
              <div><dt>Último sucesso</dt><dd>{formatDateTime(connection.checkpoint?.lastSuccessAt ?? null)}</dd></div>
              <div><dt>Última tentativa</dt><dd>{formatDateTime(connection.checkpoint?.lastAttemptAt ?? null)}</dd></div>
              <div><dt>Falhas consecutivas</dt><dd>{connection.checkpoint?.consecutiveFailures ?? 0}</dd></div>
              <div><dt>Freshness</dt><dd>{health.ageMinutes === null ? "—" : `${health.ageMinutes} min`}</dd></div>
            </dl>
            {connection.status === "ACTIVE" ? <ManualSyncButton tenant={tenant} connectionId={connection.id} /> : null}
          </article>
        ))}
      </section>

      <section className={styles.runs}>
        <div className={styles.sectionHeader}><div><p className={styles.eyebrow}>Sync Runs</p><h2>Execuções recentes</h2></div><span>{diagnostics.recentRuns.length} registros</span></div>
        <div className={styles.tableWrap}>
          <table>
            <thead><tr><th>Início</th><th>Status</th><th>Lidos</th><th>Gravados</th><th>Deduplicados</th><th>Erro</th></tr></thead>
            <tbody>
              {diagnostics.recentRuns.map((run) => (
                <tr key={run.runId}>
                  <td>{formatDateTime(run.startedAt)}</td>
                  <td>{run.status}</td>
                  <td>{run.recordsRead}</td>
                  <td>{run.recordsWritten}</td>
                  <td>{run.recordsDeduplicated}</td>
                  <td>{run.errorCode ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <footer className={styles.footer}><span>Connector Operations · INT-28</span><span>Tehkné Solutions</span></footer>
    </main>
  );
}

async function resolveState(params: Record<string, SearchValue>): Promise<State> {
  const operatorOrganizationId = first(params.operatorOrganizationId);
  const clientOrganizationId = first(params.clientOrganizationId);
  const workspaceId = first(params.workspaceId);
  const brandId = first(params.brandId);
  if (!operatorOrganizationId || !clientOrganizationId || !workspaceId) return { kind: "context-required" };

  try {
    const environment = parseServerEnvironment(process.env);
    const secret = requireSessionSecret(environment);
    const cookieStore = await cookies();
    const token = cookieStore.get(getSessionCookieName(environment.NODE_ENV))?.value;
    if (!token) throw new InvalidSessionError();
    const database = getDatabase();
    const authorizationStore = new PrismaIdentityRepository(database);
    const session = await validateSession(authorizationStore, token, secret);
    const tenant = parseTenantContext({ operatorOrganizationId, clientOrganizationId, workspaceId, ...(brandId ? { brandId } : {}) });
    await authorize(authorizationStore, { userId: session.userId, tenant, permission: "growth.connectors.manage" });
    const diagnostics = await loadConnectorOperationsDiagnostics(database, workspaceId);
    return {
      kind: "ready",
      tenant: brandId ? { operatorOrganizationId, clientOrganizationId, workspaceId, brandId } : { operatorOrganizationId, clientOrganizationId, workspaceId },
      diagnostics,
    };
  } catch (error) {
    if (error instanceof InvalidSessionError) return { kind: "authentication-required" };
    if (error instanceof AuthorizationDeniedError) return { kind: "forbidden" };
    return { kind: "unavailable" };
  }
}

function first(value: SearchValue): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function commandCenterHref(tenant: Tenant): string {
  const params = new URLSearchParams({
    operatorOrganizationId: tenant.operatorOrganizationId,
    clientOrganizationId: tenant.clientOrganizationId,
    workspaceId: tenant.workspaceId,
  });
  if (tenant.brandId) params.set("brandId", tenant.brandId);
  return `/command-center?${params.toString()}`;
}

function formatProvider(provider: string): string {
  if (provider === "GOOGLE_ADS") return "Google Ads";
  if (provider === "META_ADS") return "Meta Ads";
  return provider;
}

function formatDateTime(value: Date | null): string {
  return value ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(value) : "—";
}
