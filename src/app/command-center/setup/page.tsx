import { cookies } from "next/headers";

import {
  authorize,
  AuthorizationDeniedError,
  InvalidSessionError,
  PrismaIdentityRepository,
  validateSession,
} from "@/modules/identity";
import { getSessionCookieName } from "@/modules/identity/http/security";
import { PostgresEncryptedSecretProvider } from "@/modules/growth-connectors/secret-provider";
import { loadUnifiedOnboardingReadiness } from "@/modules/growth-onboarding/connection-readiness";
import {
  guidedActivationEnvironmentFromProcess,
  loadPendingPaidMediaActivation,
  type PendingPaidMediaActivation,
} from "@/modules/growth-onboarding/guided-activation";
import { parseTenantContext } from "@/modules/tenancy";
import { parseServerEnvironment, requireSessionSecret } from "@/shared/config/env";
import { getDatabase } from "@/shared/db/client";

import { HubSpotActivationForm, PaidMediaActivationControls } from "./activation-controls";
import styles from "./page.module.css";

type SearchValue = string | string[] | undefined;
type PageProps = { searchParams: Promise<Record<string, SearchValue>> };
type Tenant = { operatorOrganizationId: string; clientOrganizationId: string; brandId?: string; workspaceId: string };

type State =
  | { kind: "context-required" }
  | { kind: "authentication-required" }
  | { kind: "forbidden" }
  | { kind: "unavailable" }
  | {
      kind: "ready";
      tenant: Tenant;
      readiness: Awaited<ReturnType<typeof loadUnifiedOnboardingReadiness>>;
      canManagePaid: boolean;
      canManageCrm: boolean;
      pending: PendingPaidMediaActivation | null;
    };

export default async function UnifiedSetupPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const state = await resolveState(params);
  if (state.kind !== "ready") {
    const labels = {
      "context-required": ["Contexto necessário", "Abra o Setup a partir de um workspace válido."],
      "authentication-required": ["Autenticação necessária", "Entre no Tehkné Growth OS para configurar integrações."],
      forbidden: ["Acesso não autorizado", "Sua membership não possui leitura deste workspace."],
      unavailable: ["Setup indisponível", "Não foi possível calcular o readiness das integrações."],
    } as const;
    const [title, detail] = labels[state.kind];
    return <main className={styles.page}><section className={styles.state}><p>Tehkné Growth OS</p><h1>{title}</h1><span>{detail}</span></section></main>;
  }

  const { tenant, readiness } = state;
  const connectorsHref = href("/command-center/connectors", tenant);
  const setupHref = href("/command-center/setup", tenant);
  const activationError = first(params.activationError);
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Guided Provider Activation · INT-38</p>
          <h1>Conectar, verificar, selecionar e ativar sem sair do fluxo.</h1>
          <p>Google e Meta usam OAuth com PKCE e seleção explícita de conta. HubSpot é testado em modo read-only antes de entrar como conexão ACTIVE.</p>
        </div>
        <div className={styles.progress}><strong>{readiness.completionPercent}%</strong><span>{readiness.connectedProviders}/{readiness.totalProviders} providers conectados</span></div>
      </header>

      {activationError ? <p className={styles.formError} role="alert">Falha no retorno OAuth: {activationError}</p> : null}

      <section className={styles.summary} aria-label="Readiness geral">
        <article><span>Produção</span><strong>{readiness.productionReady ? "Ready" : "Configuração pendente"}</strong></article>
        <article><span>Providers</span><strong>{readiness.totalProviders}</strong></article>
        <article><span>Conectados</span><strong>{readiness.connectedProviders}</strong></article>
      </section>

      <section className={styles.grid}>
        {readiness.providers.map((provider) => (
          <article className={styles.card} data-status={provider.status} key={provider.provider}>
            <div className={styles.cardTop}>
              <div><p>{provider.provider}</p><h2>{provider.label}</h2></div>
              <span className={styles.badge}>{provider.status}</span>
            </div>
            <dl>
              <div><dt>Infraestrutura</dt><dd>{provider.infrastructureReady ? "pronta" : "pendente"}</dd></div>
              <div><dt>Conexões</dt><dd>{provider.connectionCount}</dd></div>
              <div><dt>Ativas</dt><dd>{provider.activeConnectionCount}</dd></div>
            </dl>
            {provider.missing.length > 0 ? (
              <div className={styles.missing}><strong>Falta configurar</strong><ul>{provider.missing.map((item) => <li key={item}>{item}</li>)}</ul></div>
            ) : <p className={styles.ready}>Infraestrutura segura disponível.</p>}
            <div className={styles.next}><span>Próximo passo</span><strong>{provider.nextAction}</strong></div>
            <a href={connectorsHref}>{provider.activeConnectionCount > 0 ? "Abrir operações" : "Ver diagnóstico"}</a>
          </article>
        ))}
      </section>

      <PaidMediaActivationControls
        tenant={tenant}
        returnTo={setupHref}
        canManage={state.canManagePaid}
        pending={state.pending}
      />

      <HubSpotActivationForm tenant={tenant} canManage={state.canManageCrm} />

      <section className={styles.checklist}>
        <div><p className={styles.eyebrow}>Activation Checklist</p><h2>Critério mínimo para produção</h2></div>
        <ol>
          <li>Vault criptografado e referências de credencial configuradas.</li>
          <li>OAuth concluído e conta Google Ads/Meta Ads escolhida explicitamente.</li>
          <li>HubSpot validado em leitura com Portal ID e mapa de propriedades de atribuição.</li>
          <li>Conexão ACTIVE com primeira sincronização concluída sem erro.</li>
          <li>Freshness operacional e dados de mídia, funil e atribuição no mesmo workspace.</li>
        </ol>
      </section>

      <footer className={styles.footer}><span>Guided Provider Activation · INT-38</span><span>Tehkné Solutions</span></footer>
    </main>
  );
}

async function resolveState(params: Record<string, SearchValue>): Promise<State> {
  const operatorOrganizationId = first(params.operatorOrganizationId);
  const clientOrganizationId = first(params.clientOrganizationId);
  const workspaceId = first(params.workspaceId);
  const brandId = first(params.brandId);
  const oauthAttemptId = first(params.oauthAttemptId);
  if (!operatorOrganizationId || !clientOrganizationId || !workspaceId) return { kind: "context-required" };
  try {
    const environment = parseServerEnvironment(process.env);
    const secret = requireSessionSecret(environment);
    const cookieStore = await cookies();
    const token = cookieStore.get(getSessionCookieName(environment.NODE_ENV))?.value;
    if (!token) throw new InvalidSessionError();
    const database = getDatabase();
    const repository = new PrismaIdentityRepository(database);
    const session = await validateSession(repository, token, secret);
    const tenant = parseTenantContext({ operatorOrganizationId, clientOrganizationId, workspaceId, ...(brandId ? { brandId } : {}) });
    await authorize(repository, { userId: session.userId, tenant, permission: "growth.command_center.read" });
    const canManagePaid = await hasPermission(repository, session.userId, tenant, "growth.connectors.manage");
    const canManageCrm = await hasPermission(repository, session.userId, tenant, "growth.crm.manage");
    const readiness = await loadUnifiedOnboardingReadiness(database, workspaceId, process.env);
    let pending: PendingPaidMediaActivation | null = null;
    if (oauthAttemptId && canManagePaid && process.env.CONNECTOR_SECRET_MASTER_KEY) {
      try {
        const secrets = new PostgresEncryptedSecretProvider(database, process.env.CONNECTOR_SECRET_MASTER_KEY);
        pending = await loadPendingPaidMediaActivation(
          { database, secrets },
          {
            userId: session.userId,
            workspaceId,
            attemptId: oauthAttemptId,
            environment: guidedActivationEnvironmentFromProcess(process.env),
          },
        );
      } catch {
        pending = null;
      }
    }
    return {
      kind: "ready",
      tenant: brandId ? { operatorOrganizationId, clientOrganizationId, workspaceId, brandId } : { operatorOrganizationId, clientOrganizationId, workspaceId },
      readiness,
      canManagePaid,
      canManageCrm,
      pending,
    };
  } catch (error) {
    if (error instanceof InvalidSessionError) return { kind: "authentication-required" };
    if (error instanceof AuthorizationDeniedError) return { kind: "forbidden" };
    return { kind: "unavailable" };
  }
}

async function hasPermission(
  repository: PrismaIdentityRepository,
  userId: string,
  tenant: ReturnType<typeof parseTenantContext>,
  permission: string,
): Promise<boolean> {
  try {
    await authorize(repository, { userId, tenant, permission });
    return true;
  } catch (error) {
    if (error instanceof AuthorizationDeniedError) return false;
    throw error;
  }
}

function first(value: SearchValue): string | undefined { return Array.isArray(value) ? value[0] : value; }
function href(path: string, tenant: Tenant): string {
  const params = new URLSearchParams({ operatorOrganizationId: tenant.operatorOrganizationId, clientOrganizationId: tenant.clientOrganizationId, workspaceId: tenant.workspaceId });
  if (tenant.brandId) params.set("brandId", tenant.brandId);
  return `${path}?${params.toString()}`;
}
