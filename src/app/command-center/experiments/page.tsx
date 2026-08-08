import { cookies } from "next/headers";

import {
  experimentEvidenceCaveat,
  getAllowedExperimentTransitions,
  listAuthorizedGrowthExperiments,
} from "@/modules/client-operations/experiment-registry";
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

import { ExperimentControls } from "./experiment-controls";
import styles from "./experiments.module.css";

type SearchValue = string | string[] | undefined;
type PageProps = { searchParams: Promise<Record<string, SearchValue>> };
type Tenant = { operatorOrganizationId: string; clientOrganizationId: string; workspaceId: string; brandId?: string };

type State =
  | { kind: "context-required" }
  | { kind: "authentication-required" }
  | { kind: "forbidden" }
  | { kind: "unavailable" }
  | { kind: "ready"; tenant: Tenant; clientName: string; workspaceName: string; experiments: Awaited<ReturnType<typeof listAuthorizedGrowthExperiments>> };

export default async function ExperimentRegistryPage({ searchParams }: PageProps) {
  const state = await resolveState(await searchParams);
  if (state.kind !== "ready") {
    const copy = {
      "context-required": ["Contexto necessário", "Abra o Experiment Registry a partir de um workspace válido."],
      "authentication-required": ["Autenticação necessária", "Entre novamente no Tehkné Growth OS."],
      forbidden: ["Acesso não autorizado", "Sua membership não permite ler este workspace."],
      unavailable: ["Experiment Registry indisponível", "Não foi possível carregar os experimentos. Confirme migrations e release antes de usar esta área."],
    } as const;
    const [title, detail] = copy[state.kind];
    return <main className={styles.page}><section className={styles.state}><p className={styles.eyebrow}>Tehkné Growth OS</p><h1>{title}</h1><p>{detail}</p></section></main>;
  }

  const query = new URLSearchParams({
    operatorOrganizationId: state.tenant.operatorOrganizationId,
    clientOrganizationId: state.tenant.clientOrganizationId,
    workspaceId: state.tenant.workspaceId,
  });
  if (state.tenant.brandId) query.set("brandId", state.tenant.brandId);

  const view = state.experiments.map((experiment) => ({
    id: experiment.id,
    title: experiment.title,
    hypothesis: experiment.hypothesis,
    category: experiment.category,
    design: experiment.design,
    targetMetricId: experiment.targetMetricId,
    guardrailMetricId: experiment.guardrailMetricId,
    intervention: experiment.intervention,
    status: experiment.status,
    startAt: experiment.startAt?.toISOString() ?? null,
    observationUntil: experiment.observationUntil?.toISOString() ?? null,
    decision: experiment.decision,
    resultSummary: experiment.resultSummary,
    learning: experiment.learning,
    evidenceCaveat: experimentEvidenceCaveat(experiment.design),
    allowedTransitions: getAllowedExperimentTransitions(experiment.status),
  }));

  return <main className={styles.page}>
    <header className={styles.header}>
      <div><p className={styles.eyebrow}>TKN Growth · Experiment Registry</p><h1>Aprendizado governado, não otimização por impulso.</h1><p>{state.clientName} · {state.workspaceName}. Hipótese, métrica, intervenção, janela, decisão e aprendizado ficam no mesmo registro.</p></div>
      <div className={styles.navLinks}><a href={`/command-center/client-operations?${query.toString()}`}>Client Operations</a><a href={`/command-center?${query.toString()}`}>Command Center</a></div>
    </header>
    <ExperimentControls tenant={state.tenant} experiments={view} />
    <footer className={styles.footer}><span>Experiment Registry · P1.1</span><span>Tehkné Solutions</span></footer>
  </main>;
}

async function resolveState(params: Record<string, SearchValue>): Promise<State> {
  const tenant = readTenant(params);
  if (!tenant) return { kind: "context-required" };
  try {
    const environment = parseServerEnvironment(process.env);
    const secret = requireSessionSecret(environment);
    const token = (await cookies()).get(getSessionCookieName(environment.NODE_ENV))?.value;
    if (!token) throw new InvalidSessionError();
    const database = getDatabase();
    const repository = new PrismaIdentityRepository(database);
    const session = await validateSession(repository, token, secret);
    const parsedTenant = parseTenantContext(tenant);
    const experiments = await listAuthorizedGrowthExperiments({ database, authorizationStore: repository }, { userId: session.userId, tenant: parsedTenant });
    const workspace = await database.workspace.findFirst({
      where: { id: tenant.workspaceId, operatorOrganizationId: tenant.operatorOrganizationId, clientOrganizationId: tenant.clientOrganizationId, status: "ACTIVE" },
      select: { name: true, clientOrganization: { select: { name: true } } },
    });
    if (!workspace) return { kind: "forbidden" };
    return { kind: "ready", tenant, clientName: workspace.clientOrganization.name, workspaceName: workspace.name, experiments };
  } catch (error) {
    if (error instanceof InvalidSessionError) return { kind: "authentication-required" };
    if (error instanceof AuthorizationDeniedError) return { kind: "forbidden" };
    return { kind: "unavailable" };
  }
}

function readTenant(params: Record<string, SearchValue>): Tenant | null {
  const operatorOrganizationId = first(params.operatorOrganizationId);
  const clientOrganizationId = first(params.clientOrganizationId);
  const workspaceId = first(params.workspaceId);
  const brandId = first(params.brandId);
  if (!operatorOrganizationId || !clientOrganizationId || !workspaceId) return null;
  return brandId ? { operatorOrganizationId, clientOrganizationId, workspaceId, brandId } : { operatorOrganizationId, clientOrganizationId, workspaceId };
}
function first(value: SearchValue) { return Array.isArray(value) ? value[0]?.trim() || undefined : value?.trim() || undefined; }
