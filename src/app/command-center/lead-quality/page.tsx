import { cookies } from "next/headers";

import { loadAuthorizedLeadQualityWorkspace } from "@/modules/client-operations/lead-quality";
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

import { LeadQualityControls } from "./lead-quality-controls";
import styles from "./lead-quality.module.css";

type SearchValue = string | string[] | undefined;
type PageProps = { searchParams: Promise<Record<string, SearchValue>> };
type Tenant = { operatorOrganizationId: string; clientOrganizationId: string; workspaceId: string; brandId?: string };

type State =
  | { kind: "context-required" }
  | { kind: "authentication-required" }
  | { kind: "forbidden" }
  | { kind: "unavailable" }
  | {
      kind: "ready";
      tenant: Tenant;
      clientName: string;
      workspaceName: string;
      workspace: Awaited<ReturnType<typeof loadAuthorizedLeadQualityWorkspace>>;
    };

export default async function LeadQualityPage({ searchParams }: PageProps) {
  const state = await resolveState(await searchParams);
  if (state.kind !== "ready") {
    const copy = {
      "context-required": ["Contexto necessário", "Abra Lead Quality a partir de um workspace válido."],
      "authentication-required": ["Autenticação necessária", "Entre novamente no Tehkné Growth OS."],
      forbidden: ["Acesso não autorizado", "Sua membership não permite ler este workspace."],
      unavailable: ["Lead Quality indisponível", "Não foi possível carregar a taxonomia. Confirme migrations e release antes de usar esta área."],
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

  const observations = state.workspace.latestObservations.map((item) => ({
    id: item.id,
    leadReference: item.leadReference,
    sourceChannel: item.sourceChannel,
    campaignReference: item.campaignReference,
    qualityClass: item.qualityClass,
    reasonCode: item.reasonCode,
    observedAt: item.observedAt.toISOString(),
    evidenceReference: item.evidenceReference,
  }));

  return <main className={styles.page}>
    <header className={styles.header}>
      <div>
        <p className={styles.eyebrow}>TKN Growth · Lead Quality</p>
        <h1>Volume sem qualidade não é crescimento.</h1>
        <p>{state.clientName} · {state.workspaceName}. A taxonomia transforma feedback comercial em evidência operacional sem armazenar e-mail/telefone e sem confundir campaign reference com atribuição.</p>
      </div>
      <div className={styles.navLinks}>
        <a href={`/command-center/pacing?${query.toString()}`}>Pacing</a>
        <a href={`/command-center/strategy?${query.toString()}`}>Strategy</a>
        <a href={`/command-center?${query.toString()}`}>Command Center</a>
      </div>
    </header>
    <LeadQualityControls tenant={state.tenant} summary={state.workspace.summary} segments={state.workspace.segments} observations={observations} />
    <footer className={styles.footer}><span>Lead Quality · P1.4</span><span>Tehkné Solutions</span></footer>
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
    const workspace = await loadAuthorizedLeadQualityWorkspace({ database, authorizationStore: repository }, { userId: session.userId, tenant: parsedTenant });
    const context = await database.workspace.findFirst({
      where: { id: tenant.workspaceId, operatorOrganizationId: tenant.operatorOrganizationId, clientOrganizationId: tenant.clientOrganizationId, status: "ACTIVE" },
      select: { name: true, clientOrganization: { select: { name: true } } },
    });
    if (!context) return { kind: "forbidden" };
    return { kind: "ready", tenant, clientName: context.clientOrganization.name, workspaceName: context.name, workspace };
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
