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
import { parseTenantContext } from "@/modules/tenancy";
import { parseServerEnvironment, requireSessionSecret } from "@/shared/config/env";
import { getDatabase } from "@/shared/db/client";

import styles from "./page.module.css";

type SearchValue = string | string[] | undefined;
type PageProps = { searchParams: Promise<Record<string, SearchValue>> };
type Tenant = { operatorOrganizationId: string; clientOrganizationId: string; brandId?: string; workspaceId: string };

type State =
  | { kind: "context-required" }
  | { kind: "authentication-required" }
  | { kind: "forbidden" }
  | { kind: "unavailable" }
  | { kind: "ready"; tenant: Tenant; readiness: Awaited<ReturnType<typeof loadUnifiedOnboardingReadiness>> };

export default async function UnifiedSetupPage({ searchParams }: PageProps) {
  const state = await resolveState(await searchParams);
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
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Unified Setup · INT-37</p>
          <h1>Conecte mídia e CRM com readiness explícito.</h1>
          <p>O setup não expõe tokens. Ele valida infraestrutura, detecta conexões reais e conduz para a operação segura já existente.</p>
        </div>
        <div className={styles.progress}><strong>{readiness.completionPercent}%</strong><span>{readiness.connectedProviders}/{readiness.totalProviders} providers conectados</span></div>
      </header>

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
            <a href={connectorsHref}>{provider.activeConnectionCount > 0 ? "Abrir operações" : "Continuar configuração"}</a>
          </article>
        ))}
      </section>

      <section className={styles.checklist}>
        <div><p className={styles.eyebrow}>Activation Checklist</p><h2>Critério mínimo para produção</h2></div>
        <ol>
          <li>Vault criptografado e referências de credencial configuradas.</li>
          <li>Conta Google Ads ou Meta Ads selecionada e conexão ACTIVE.</li>
          <li>HubSpot conectado com propriedades de atribuição mapeadas no adapter/runtime.</li>
          <li>Primeira sincronização concluída sem erro e freshness diferente de unavailable.</li>
          <li>Command Center recebendo mídia, funil e atribuição para o mesmo workspace.</li>
        </ol>
      </section>

      <footer className={styles.footer}><span>Unified Onboarding · INT-37</span><span>Tehkné Solutions</span></footer>
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
    const repository = new PrismaIdentityRepository(database);
    const session = await validateSession(repository, token, secret);
    const tenant = parseTenantContext({ operatorOrganizationId, clientOrganizationId, workspaceId, ...(brandId ? { brandId } : {}) });
    await authorize(repository, { userId: session.userId, tenant, permission: "growth.command_center.read" });
    const readiness = await loadUnifiedOnboardingReadiness(database, workspaceId, process.env);
    return { kind: "ready", tenant: brandId ? { operatorOrganizationId, clientOrganizationId, workspaceId, brandId } : { operatorOrganizationId, clientOrganizationId, workspaceId }, readiness };
  } catch (error) {
    if (error instanceof InvalidSessionError) return { kind: "authentication-required" };
    if (error instanceof AuthorizationDeniedError) return { kind: "forbidden" };
    return { kind: "unavailable" };
  }
}

function first(value: SearchValue): string | undefined { return Array.isArray(value) ? value[0] : value; }
function href(path: string, tenant: Tenant): string {
  const params = new URLSearchParams({ operatorOrganizationId: tenant.operatorOrganizationId, clientOrganizationId: tenant.clientOrganizationId, workspaceId: tenant.workspaceId });
  if (tenant.brandId) params.set("brandId", tenant.brandId);
  return `${path}?${params.toString()}`;
}
