import { cookies } from "next/headers";

import {
  AuthorizationDeniedError,
  InvalidSessionError,
  PrismaIdentityRepository,
  validateSession,
} from "@/modules/identity";
import { loadAuthorizedCommandCenterSnapshot } from "@/modules/command-center/authorized-query";
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

export default async function CommandCenterPage({
  searchParams,
}: CommandCenterPageProps) {
  const params = await searchParams;
  const context = readContext(params);
  if (!context) {
    return (
      <StatePage
        title="Selecione um workspace"
        detail="O Command Center só consulta dados depois que um contexto completo de operadora, cliente, workspace e período é informado e autorizado."
        code="operatorOrganizationId · clientOrganizationId · workspaceId · from · to"
      />
    );
  }

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

    return (
      <main className={styles.page}>
        <div className={styles.topbar}>
          <div className={styles.brand}>
            <span className={styles.brandMark} />
            Tehkné Growth OS
          </div>
          <span className={styles.context}>Workspace {snapshot.workspaceId}</span>
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
  } catch (error) {
    if (error instanceof InvalidSessionError) {
      return (
        <StatePage
          title="Autenticação necessária"
          detail="Entre no Tehkné Growth OS antes de acessar dados operacionais."
          code="401 · authentication_required"
        />
      );
    }
    if (error instanceof AuthorizationDeniedError) {
      return (
        <StatePage
          title="Acesso não autorizado"
          detail="Sua membership atual não concede leitura do Command Center neste workspace."
          code="403 · growth.command_center.read"
        />
      );
    }
    return (
      <StatePage
        title="Command Center indisponível"
        detail="Não foi possível carregar o snapshot persistido deste workspace."
        code="command_center_unavailable"
      />
    );
  }
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

function readContext(params: Record<string, SearchValue>) {
  const operatorOrganizationId = first(params.operatorOrganizationId);
  const clientOrganizationId = first(params.clientOrganizationId);
  const workspaceId = first(params.workspaceId);
  const brandId = first(params.brandId);
  const fromRaw = first(params.from);
  const toRaw = first(params.to);
  if (
    !operatorOrganizationId ||
    !clientOrganizationId ||
    !workspaceId ||
    !fromRaw ||
    !toRaw
  ) {
    return null;
  }

  const from = new Date(fromRaw);
  const to = new Date(toRaw);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to < from) {
    return null;
  }

  return {
    operatorOrganizationId,
    clientOrganizationId,
    workspaceId,
    brandId,
    from,
    to,
  };
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
