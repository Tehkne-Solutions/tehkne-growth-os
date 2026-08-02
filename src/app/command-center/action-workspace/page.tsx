import { cookies } from "next/headers";

import {
  AuthorizationDeniedError,
  InvalidSessionError,
  PrismaIdentityRepository,
  validateSession,
} from "@/modules/identity";
import { getSessionCookieName } from "@/modules/identity/http/security";
import { listActionEffectiveness, type ActionEffectivenessRecord } from "@/modules/growth-intelligence/action-effectiveness";
import { loadAuthorizedInterpretedCommandCenterIntelligence } from "@/modules/growth-intelligence/authorized-intelligence";
import { listGrowthActions, type GrowthActionItem } from "@/modules/growth-intelligence/action-workflow";
import type { PlaybookRecommendation } from "@/modules/growth-intelligence/playbook-engine";
import { summarizeEffectiveness, type EffectivenessSummary } from "@/modules/growth-intelligence/playbook-effectiveness";
import { parseTenantContext } from "@/modules/tenancy";
import { parseServerEnvironment, requireSessionSecret } from "@/shared/config/env";
import { getDatabase } from "@/shared/db/client";

import { ActionWorkspace } from "../action-workspace";
import styles from "../action-workspace.module.css";

type SearchValue = string | string[] | undefined;
type PageProps = { searchParams: Promise<Record<string, SearchValue>> };
type WorkspaceContext = {
  tenant: {
    operatorOrganizationId: string;
    clientOrganizationId: string;
    brandId?: string;
    workspaceId: string;
  };
  from: Date;
  to: Date;
};

type PageState =
  | { kind: "context-required" }
  | { kind: "authentication-required" }
  | { kind: "forbidden" }
  | { kind: "unavailable" }
  | {
      kind: "ready";
      context: WorkspaceContext;
      recommendations: readonly PlaybookRecommendation[];
      actions: readonly GrowthActionItem[];
      outcomes: readonly ActionEffectivenessRecord[];
      effectiveness: EffectivenessSummary;
      backQuery: string;
    };

export default async function ActionWorkspacePage({ searchParams }: PageProps) {
  const params = await searchParams;
  const state = await resolveState(params);

  switch (state.kind) {
    case "context-required":
      return <StatePage title="Contexto incompleto" detail="Abra primeiro um workspace e período no Command Center para acessar a fila operacional." />;
    case "authentication-required":
      return <StatePage title="Autenticação necessária" detail="Entre novamente antes de operar ações de Growth." />;
    case "forbidden":
      return <StatePage title="Acesso não autorizado" detail="Sua membership não concede leitura deste workspace." />;
    case "unavailable":
      return <StatePage title="Action Workspace indisponível" detail="Não foi possível carregar recomendações e ações persistidas." />;
    case "ready":
      return <ReadyPage state={state} />;
  }
}

async function resolveState(params: Record<string, SearchValue>): Promise<PageState> {
  const context = readContext(params);
  if (!context) return { kind: "context-required" };

  try {
    const environment = parseServerEnvironment(process.env);
    const secret = requireSessionSecret(environment);
    const cookieStore = await cookies();
    const token = cookieStore.get(getSessionCookieName(environment.NODE_ENV))?.value;
    if (!token) throw new InvalidSessionError();

    const database = getDatabase();
    const identityRepository = new PrismaIdentityRepository(database);
    const session = await validateSession(identityRepository, token, secret);
    const tenant = parseTenantContext(context.tenant);
    const intelligence = await loadAuthorizedInterpretedCommandCenterIntelligence(
      { database, authorizationStore: identityRepository },
      { userId: session.userId, tenant, from: context.from, to: context.to },
    );
    const [actions, outcomes] = await Promise.all([
      listGrowthActions(database, context.tenant.workspaceId),
      listActionEffectiveness(database, context.tenant.workspaceId),
    ]);

    return {
      kind: "ready",
      context,
      recommendations: intelligence.recommendations,
      actions,
      outcomes,
      effectiveness: summarizeEffectiveness(outcomes),
      backQuery: toSearchParams(params),
    };
  } catch (error) {
    if (error instanceof InvalidSessionError) return { kind: "authentication-required" };
    if (error instanceof AuthorizationDeniedError) return { kind: "forbidden" };
    return { kind: "unavailable" };
  }
}

function ReadyPage({ state }: Readonly<{ state: Extract<PageState, { kind: "ready" }> }>) {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Tehkné Growth OS · Action Workspace</p>
          <h1 className={styles.title}>Recomendações, execução humana e aprendizado mensurável.</h1>
        </div>
        <div>
          <div className={styles.period}>{formatDate(state.context.from)} — {formatDate(state.context.to)}</div>
          <a className={styles.backLink} href={`/command-center?${state.backQuery}`}>Voltar ao Command Center</a>
        </div>
      </header>

      <ActionWorkspace
        tenant={state.context.tenant}
        from={state.context.from.toISOString()}
        to={state.context.to.toISOString()}
        recommendations={state.recommendations}
        initialActions={state.actions}
        initialOutcomes={state.outcomes}
        initialEffectiveness={state.effectiveness}
      />
    </main>
  );
}

function StatePage({ title, detail }: Readonly<{ title: string; detail: string }>) {
  return (
    <main className={styles.page}>
      <section className={styles.state}>
        <p className={styles.eyebrow}>Tehkné Growth OS</p>
        <h1>{title}</h1>
        <p>{detail}</p>
        <a className={styles.backLink} href="/command-center">Voltar ao Command Center</a>
      </section>
    </main>
  );
}

function readContext(params: Record<string, SearchValue>): WorkspaceContext | null {
  const operatorOrganizationId = first(params.operatorOrganizationId);
  const encoded = first(params.workspaceContext);
  const decoded = encoded ? decodeWorkspaceContext(encoded) : null;
  const clientOrganizationId = decoded?.clientOrganizationId ?? first(params.clientOrganizationId);
  const workspaceId = decoded?.workspaceId ?? first(params.workspaceId);
  const brandId = decoded?.brandId ?? first(params.brandId);
  const fromRaw = first(params.from);
  const toRaw = first(params.to);
  if (!operatorOrganizationId || !clientOrganizationId || !workspaceId || !fromRaw || !toRaw) return null;

  const from = startOfUtcDay(fromRaw);
  const to = endOfUtcDay(toRaw);
  if (!from || !to || to < from) return null;

  const tenant = brandId
    ? { operatorOrganizationId, clientOrganizationId, brandId, workspaceId }
    : { operatorOrganizationId, clientOrganizationId, workspaceId };
  return { tenant, from, to };
}

function decodeWorkspaceContext(value: string) {
  const [workspaceId, clientOrganizationId, brandId = ""] = value.split(":");
  if (!workspaceId || !clientOrganizationId) return null;
  return { workspaceId, clientOrganizationId, brandId: brandId || undefined };
}

function startOfUtcDay(value: string): Date | null {
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function endOfUtcDay(value: string): Date | null {
  const date = new Date(`${value}T23:59:59.999Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function first(value: SearchValue): string | undefined {
  if (Array.isArray(value)) return value[0]?.trim() || undefined;
  return value?.trim() || undefined;
}

function toSearchParams(params: Record<string, SearchValue>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    const normalized = Array.isArray(value) ? value[0] : value;
    if (normalized) search.set(key, normalized);
  }
  return search.toString();
}

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(value);
}
