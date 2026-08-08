import { cookies } from "next/headers";

import {
  authorize,
  AuthorizationDeniedError,
  InvalidSessionError,
  PrismaIdentityRepository,
  validateSession,
} from "@/modules/identity";
import { getSessionCookieName } from "@/modules/identity/http/security";
import { loadUnifiedOnboardingReadiness } from "@/modules/growth-onboarding/connection-readiness";
import { buildOperationalReleaseConsole } from "@/modules/growth-operations/operational-release-console";
import { auditProductionReadiness } from "@/modules/growth-operations/production-readiness";
import { parseTenantContext } from "@/modules/tenancy";
import { parseServerEnvironment, requireSessionSecret } from "@/shared/config/env";
import { getDatabase } from "@/shared/db/client";

import styles from "./page.module.css";

type SearchValue = string | string[] | undefined;
type PageProps = { searchParams: Promise<Record<string, SearchValue>> };

type State =
  | { kind: "context-required" }
  | { kind: "authentication-required" }
  | { kind: "forbidden" }
  | { kind: "unavailable" }
  | {
      kind: "ready";
      console: ReturnType<typeof buildOperationalReleaseConsole>;
      setupHref: string;
      commandCenterHref: string;
      clientOperationsHref: string;
    };

export default async function OperationalConsolePage({ searchParams }: PageProps) {
  const state = await resolveState(await searchParams);
  if (state.kind !== "ready") {
    const copy = {
      "context-required": ["Contexto necessário", "Abra o console operacional a partir de um workspace válido."],
      "authentication-required": ["Autenticação necessária", "Entre no Tehkné Growth OS para visualizar o estado operacional."],
      forbidden: ["Acesso não autorizado", "Sua membership não concede leitura operacional neste workspace."],
      unavailable: ["Console indisponível", "Não foi possível consolidar readiness, release e operação deste workspace."],
    } as const;
    const [title, detail] = copy[state.kind];
    return <main className={styles.page}><section className={styles.state}><p>Tehkné Growth OS</p><h1>{title}</h1><span>{detail}</span></section></main>;
  }

  const snapshot = state.console;
  return (
    <main className={styles.page}>
      <nav className={styles.nav}>
        <div><span className={styles.brandMark} />Tehkné Growth OS</div>
        <div className={styles.links}><a href={state.commandCenterHref}>Command Center</a><a href={state.clientOperationsHref}>Client Operations</a><a href={state.setupHref}>Setup</a></div>
      </nav>

      <header className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>INT-75 · Final Operational Console</p>
          <h1>Release, runtime e pendências externas em uma única visão operacional.</h1>
          <p>O Core permanece certificado de forma independente. Providers só avançam após credenciais reais, conta real e first-sync verificado.</p>
        </div>
        <div className={styles.releaseCard} data-state={snapshot.release.coreStatus}>
          <span>{snapshot.release.channel}</span>
          <strong>{snapshot.release.version}</strong>
          <small>Core {snapshot.release.coreStatus} · Providers {snapshot.release.providerCertification}</small>
        </div>
      </header>

      <section className={styles.kpis} aria-label="Estado operacional">
        <article><span>Production readiness</span><strong>{snapshot.productionStatus.toUpperCase()}</strong></article>
        <article><span>Core</span><strong>{snapshot.coreCertified ? "CERTIFIED" : "BLOCKED"}</strong></article>
        <article><span>Providers certificados</span><strong>{snapshot.providersCertified}/{snapshot.providersTotal}</strong></article>
        <article><span>Pendências externas</span><strong>{snapshot.externallyPending}</strong></article>
      </section>

      <section className={styles.panel}>
        <div className={styles.sectionHeader}><div><p className={styles.eyebrow}>Deployment</p><h2>Runtime publicado</h2></div></div>
        <dl className={styles.runtimeGrid}>
          <div><dt>Environment</dt><dd>{snapshot.deployment.environment ?? "unknown"}</dd></div>
          <div><dt>Git SHA</dt><dd className={styles.mono}>{snapshot.deployment.sha ?? "unavailable"}</dd></div>
          <div><dt>Production URL</dt><dd className={styles.mono}>{snapshot.deployment.productionUrl ?? "unavailable"}</dd></div>
          <div><dt>Scheduler</dt><dd>{snapshot.scheduler.status.toUpperCase()} · {snapshot.scheduler.detail}</dd></div>
        </dl>
      </section>

      <section className={styles.panel}>
        <div className={styles.sectionHeader}><div><p className={styles.eyebrow}>Capability Matrix</p><h2>O que está certificado e o que ainda depende do mundo externo.</h2></div><span>{snapshot.strictProductionReady ? "FULL READY" : "CORE READY"}</span></div>
        <div className={styles.capabilityGrid}>
          {snapshot.capabilities.map((item) => (
            <article className={styles.capabilityCard} data-state={item.state} key={item.key}>
              <div><span>{item.key}</span><strong>{item.state}</strong></div>
              <h3>{item.label}</h3>
              <p>{item.detail}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.twoColumns}>
        <article className={styles.panel}>
          <div className={styles.sectionHeader}><div><p className={styles.eyebrow}>Operational Attention</p><h2>Alertas e avisos</h2></div><span>{snapshot.alerts.length}</span></div>
          {snapshot.alerts.length > 0 ? <ul className={styles.alertList}>{snapshot.alerts.map((alert) => (
            <li data-severity={alert.severity} key={alert.key}><strong>{alert.title}</strong><span>{alert.detail}</span></li>
          ))}</ul> : <p className={styles.ok}>Nenhuma atenção operacional pendente.</p>}
        </article>

        <article className={styles.panel}>
          <div className={styles.sectionHeader}><div><p className={styles.eyebrow}>Next Actions</p><h2>Próximos passos objetivos</h2></div></div>
          {snapshot.nextActions.length > 0 ? <ol className={styles.actionList}>{snapshot.nextActions.map((action) => <li key={action}>{action}</li>)}</ol> : <p className={styles.ok}>Full Production Certification pronta para promoção.</p>}
        </article>
      </section>

      <footer className={styles.footer}><span>Production Candidate Core · {snapshot.release.version}</span><span>{snapshot.release.signature}</span></footer>
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
    const sessionSecret = requireSessionSecret(environment);
    const cookieStore = await cookies();
    const token = cookieStore.get(getSessionCookieName(environment.NODE_ENV))?.value;
    if (!token) throw new InvalidSessionError();

    const database = getDatabase();
    const repository = new PrismaIdentityRepository(database);
    const session = await validateSession(repository, token, sessionSecret);
    const tenant = parseTenantContext({ operatorOrganizationId, clientOrganizationId, workspaceId, ...(brandId ? { brandId } : {}) });
    await authorize(repository, { userId: session.userId, tenant, permission: "growth.command_center.read" });

    const [onboarding, production] = await Promise.all([
      loadUnifiedOnboardingReadiness(database, workspaceId, process.env),
      auditProductionReadiness(database, workspaceId, process.env),
    ]);
    const query = new URLSearchParams({ operatorOrganizationId, clientOrganizationId, workspaceId });
    if (brandId) query.set("brandId", brandId);

    return {
      kind: "ready",
      console: buildOperationalReleaseConsole({ onboarding, production, environment: process.env }),
      setupHref: `/command-center/setup?${query.toString()}`,
      commandCenterHref: `/command-center?${query.toString()}`,
      clientOperationsHref: `/command-center/client-operations?${query.toString()}`,
    };
  } catch (error) {
    if (error instanceof InvalidSessionError) return { kind: "authentication-required" };
    if (error instanceof AuthorizationDeniedError) return { kind: "forbidden" };
    return { kind: "unavailable" };
  }
}

function first(value: SearchValue): string | undefined { return Array.isArray(value) ? value[0] : value; }
