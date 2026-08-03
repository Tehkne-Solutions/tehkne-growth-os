import { cookies } from "next/headers";

import {
  authorize,
  AuthorizationDeniedError,
  InvalidSessionError,
  PrismaIdentityRepository,
  validateSession,
} from "@/modules/identity";
import { getSessionCookieName } from "@/modules/identity/http/security";
import {
  ATTRIBUTION_REVIEW_PERMISSION,
  loadAttributionIntelligence,
} from "@/modules/growth-attribution/intelligence";
import { parseTenantContext } from "@/modules/tenancy";
import { parseServerEnvironment, requireSessionSecret } from "@/shared/config/env";
import { getDatabase } from "@/shared/db/client";

import { AttributionReviewButtons } from "./review-buttons";
import styles from "./page.module.css";

type SearchValue = string | string[] | undefined;
type PageProps = { searchParams: Promise<Record<string, SearchValue>> };
type Tenant = { operatorOrganizationId: string; clientOrganizationId: string; brandId?: string; workspaceId: string };

type State =
  | { kind: "context-required" }
  | { kind: "authentication-required" }
  | { kind: "forbidden" }
  | { kind: "unavailable" }
  | { kind: "ready"; tenant: Tenant; from: Date; to: Date; canReview: boolean; intelligence: Awaited<ReturnType<typeof loadAttributionIntelligence>> };

export default async function AttributionPage({ searchParams }: PageProps) {
  const state = await resolveState(await searchParams);
  if (state.kind !== "ready") {
    const labels = {
      "context-required": ["Contexto necessário", "Abra a atribuição a partir de um workspace e período válidos."],
      "authentication-required": ["Autenticação necessária", "Entre no Tehkné Growth OS para visualizar atribuição."],
      forbidden: ["Acesso não autorizado", "Sua membership não possui leitura do Command Center neste workspace."],
      unavailable: ["Atribuição indisponível", "Não foi possível carregar a inteligência de atribuição."],
    } as const;
    const [title, detail] = labels[state.kind];
    return <main className={styles.page}><section className={styles.state}><p>Tehkné Growth OS</p><h1>{title}</h1><span>{detail}</span></section></main>;
  }

  const { tenant, intelligence, canReview } = state;
  const unattributed = Math.max(0, intelligence.coverage.totalLeads - intelligence.coverage.attributedLeads);
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Attribution Intelligence</p>
          <h1>Campanha → lead → oportunidade → receita, com confiança explícita.</h1>
          <p>Atribuição usa evidência observável, separa vínculos observados/confirmados/rejeitados e nunca usa proximidade temporal isolada.</p>
        </div>
        <span>{formatDate(state.from)} — {formatDate(state.to)}</span>
      </header>

      <section className={styles.kpis}>
        <article><span>Cobertura</span><strong>{formatPercent(intelligence.coverage.coveragePercent)}</strong><small>{intelligence.coverage.attributedLeads} de {intelligence.coverage.totalLeads} leads</small></article>
        <article><span>Confirmados</span><strong>{intelligence.coverage.confirmedLeads}</strong><small>leads com atribuição revisada/confirmada</small></article>
        <article><span>Observados</span><strong>{intelligence.coverage.observedLeads}</strong><small>evidências ainda aguardando decisão</small></article>
        <article><span>Rejeitados</span><strong>{intelligence.coverage.rejectedLeads}</strong><small>evidências explicitamente descartadas</small></article>
        <article><span>Não atribuídos</span><strong>{unattributed}</strong><small>leads sem campanha utilizável</small></article>
        <article><span>Campanhas</span><strong>{intelligence.campaigns.length}</strong><small>com métricas atribuídas no período</small></article>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}><div><p className={styles.eyebrow}>Campaign Revenue</p><h2>Receita e ROAS atribuídos por campanha</h2></div></div>
        <div className={styles.tableWrap}>
          <table>
            <thead><tr><th>Provider</th><th>Campanha</th><th>Leads</th><th>Won</th><th>Receita</th><th>Spend</th><th>ROAS</th><th>Confiança</th><th>Status</th></tr></thead>
            <tbody>
              {intelligence.campaigns.length === 0 ? <tr><td colSpan={9}>Nenhuma métrica atribuída materializada para esta janela.</td></tr> : intelligence.campaigns.map((campaign) => (
                <tr key={`${campaign.provider}:${campaign.externalAccountId ?? "none"}:${campaign.campaignId}:${campaign.currency ?? "none"}`}>
                  <td>{formatProvider(campaign.provider)}</td><td>{campaign.campaignId}</td><td>{campaign.attributedLeads}</td><td>{campaign.attributedWonDeals}</td>
                  <td>{formatMoney(campaign.attributedRevenue, campaign.currency)}</td><td>{formatMoney(campaign.mediaSpend, campaign.currency)}</td><td>{campaign.attributedRoas === null ? "—" : campaign.attributedRoas.toFixed(2)}</td>
                  <td><span className={styles.high}>H {campaign.confidenceHighCount}</span> · <span className={styles.medium}>M {campaign.confidenceMediumCount}</span></td>
                  <td>O {campaign.statusObservedCount} · C {campaign.statusConfirmedCount} · R {campaign.statusRejectedCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}><div><p className={styles.eyebrow}>Review Queue</p><h2>Associações que pedem julgamento humano</h2></div><span>{canReview ? "revisão habilitada" : "somente leitura"}</span></div>
        <div className={styles.reviewGrid}>
          {intelligence.reviewQueue.length === 0 ? <article className={styles.empty}><h3>Nenhuma associação pendente.</h3><p>A fila está limpa para este período.</p></article> : intelligence.reviewQueue.map((item) => (
            <article className={styles.reviewCard} key={item.id} data-confidence={item.confidence}>
              <div className={styles.reviewTop}><span>{item.confidence} · {item.evidenceType}</span><strong>{formatProvider(item.provider)}</strong></div>
              <h3>Campanha {item.campaignId ?? "—"}</h3>
              <p>Lead ref. {shortId(item.subjectId)} · {item.opportunityCount} oportunidades · {item.wonOpportunityCount} ganhas</p>
              <p>Receita ganha relacionada: <strong>{formatMoney(item.wonRevenue, item.currency)}</strong></p>
              <small>Observada em {formatDateTime(item.observedAt)}</small>
              {canReview ? <AttributionReviewButtons tenant={tenant} attributionLinkId={item.id} from={state.from.toISOString()} to={state.to.toISOString()} /> : null}
            </article>
          ))}
        </div>
      </section>

      <footer className={styles.footer}><span>Attribution Automation · INT-36</span><span>Tehkné Solutions</span></footer>
    </main>
  );
}

async function resolveState(params: Record<string, SearchValue>): Promise<State> {
  const operatorOrganizationId = first(params.operatorOrganizationId);
  const clientOrganizationId = first(params.clientOrganizationId);
  const workspaceId = first(params.workspaceId);
  const brandId = first(params.brandId);
  const from = parseDate(first(params.from));
  const to = parseDate(first(params.to), true);
  if (!operatorOrganizationId || !clientOrganizationId || !workspaceId || !from || !to || to < from) return { kind: "context-required" };
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
    let canReview = true;
    try { await authorize(repository, { userId: session.userId, tenant, permission: ATTRIBUTION_REVIEW_PERMISSION }); } catch (error) { if (error instanceof AuthorizationDeniedError) canReview = false; else throw error; }
    const intelligence = await loadAttributionIntelligence(database, { workspaceId, from, to });
    return { kind: "ready", tenant: brandId ? { operatorOrganizationId, clientOrganizationId, workspaceId, brandId } : { operatorOrganizationId, clientOrganizationId, workspaceId }, from, to, canReview, intelligence };
  } catch (error) {
    if (error instanceof InvalidSessionError) return { kind: "authentication-required" };
    if (error instanceof AuthorizationDeniedError) return { kind: "forbidden" };
    return { kind: "unavailable" };
  }
}
function first(value: SearchValue): string | undefined { return Array.isArray(value) ? value[0] : value; }
function parseDate(value: string | undefined, end = false): Date | null { if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null; const date = new Date(`${value}T${end ? "23:59:59.999" : "00:00:00.000"}Z`); return Number.isNaN(date.getTime()) ? null : date; }
function formatDate(value: Date): string { return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "UTC" }).format(value); }
function formatDateTime(value: Date): string { return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(value); }
function formatPercent(value: number | null): string { return value === null ? "—" : `${value.toFixed(1)}%`; }
function formatProvider(value: string): string { return value === "GOOGLE_ADS" ? "Google Ads" : value === "META_ADS" ? "Meta Ads" : value; }
function formatMoney(value: number, currency: string | null): string { return currency ? new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(value) : value.toLocaleString("pt-BR", { maximumFractionDigits: 2 }); }
function shortId(value: string): string { return `${value.slice(0, 8)}…`; }
