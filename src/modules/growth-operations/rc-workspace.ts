import type { DatabaseClient } from "@/shared/db/client";

export const RC_OPERATOR_SLUG = "tehkne-solutions";
export const RC_CLIENT_SLUG = "tkn-growth-rc";
export const RC_WORKSPACE_SLUG = "rc-validation";

const RC_OPERATOR_ID = "91000000-0000-4000-8000-000000000001";
const RC_CLIENT_ID = "92000000-0000-4000-8000-000000000001";
const RC_WORKSPACE_ID = "93000000-0000-4000-8000-000000000001";
const RC_AUDIT_EVENT_ID = "94000000-0000-4000-8000-000000000001";

export type RcWorkspaceSnapshot = {
  id: string;
  name: string;
  slug: string;
};

export async function findRcWorkspace(database: DatabaseClient): Promise<RcWorkspaceSnapshot | null> {
  return database.workspace.findFirst({
    where: {
      slug: RC_WORKSPACE_SLUG,
      status: "ACTIVE",
      clientOrganization: {
        slug: RC_CLIENT_SLUG,
        status: "ACTIVE",
        operatorOrganization: {
          slug: RC_OPERATOR_SLUG,
          status: "ACTIVE",
        },
      },
    },
    select: {
      id: true,
      name: true,
      slug: true,
    },
  });
}

export async function bootstrapRcWorkspace(database: DatabaseClient): Promise<RcWorkspaceSnapshot> {
  return database.$transaction(async (transaction) => {
    const operator = await transaction.operatorOrganization.upsert({
      where: { slug: RC_OPERATOR_SLUG },
      create: {
        id: RC_OPERATOR_ID,
        slug: RC_OPERATOR_SLUG,
        name: "Tehkné Solutions",
        status: "ACTIVE",
        timezone: "America/Sao_Paulo",
      },
      update: {
        name: "Tehkné Solutions",
        status: "ACTIVE",
        timezone: "America/Sao_Paulo",
      },
    });

    const client = await transaction.clientOrganization.upsert({
      where: {
        operatorOrganizationId_slug: {
          operatorOrganizationId: operator.id,
          slug: RC_CLIENT_SLUG,
        },
      },
      create: {
        id: RC_CLIENT_ID,
        operatorOrganizationId: operator.id,
        slug: RC_CLIENT_SLUG,
        name: "TKN Growth RC",
        legalName: "Tehkné Solutions",
        status: "ACTIVE",
        locale: "pt-BR",
        currency: "BRL",
        timezone: "America/Sao_Paulo",
      },
      update: {
        name: "TKN Growth RC",
        legalName: "Tehkné Solutions",
        status: "ACTIVE",
        locale: "pt-BR",
        currency: "BRL",
        timezone: "America/Sao_Paulo",
      },
    });

    const workspace = await transaction.workspace.upsert({
      where: {
        clientOrganizationId_slug: {
          clientOrganizationId: client.id,
          slug: RC_WORKSPACE_SLUG,
        },
      },
      create: {
        id: RC_WORKSPACE_ID,
        operatorOrganizationId: operator.id,
        clientOrganizationId: client.id,
        slug: RC_WORKSPACE_SLUG,
        name: "RC Validation",
        kind: "GROWTH_OPERATIONS",
        status: "ACTIVE",
      },
      update: {
        operatorOrganizationId: operator.id,
        name: "RC Validation",
        kind: "GROWTH_OPERATIONS",
        status: "ACTIVE",
      },
      select: {
        id: true,
        name: true,
        slug: true,
      },
    });

    await transaction.auditEvent.upsert({
      where: { id: RC_AUDIT_EVENT_ID },
      create: {
        id: RC_AUDIT_EVENT_ID,
        operatorOrganizationId: operator.id,
        clientOrganizationId: client.id,
        workspaceId: workspace.id,
        action: "rc.workspace.bootstrap",
        resourceType: "workspace",
        resourceId: workspace.id,
        requestId: "int-45-runtime-rc-workspace",
        metadata: {
          workspaceSlug: RC_WORKSPACE_SLUG,
          clientSlug: RC_CLIENT_SLUG,
          operatorSlug: RC_OPERATOR_SLUG,
          signature: "Tehkné Solutions",
        },
      },
      update: {
        operatorOrganizationId: operator.id,
        clientOrganizationId: client.id,
        workspaceId: workspace.id,
        resourceId: workspace.id,
        requestId: "int-45-runtime-rc-workspace",
        metadata: {
          workspaceSlug: RC_WORKSPACE_SLUG,
          clientSlug: RC_CLIENT_SLUG,
          operatorSlug: RC_OPERATOR_SLUG,
          signature: "Tehkné Solutions",
        },
      },
    });

    return workspace;
  });
}
