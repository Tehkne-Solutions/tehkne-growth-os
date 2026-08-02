import type { AuthorizationMembershipStore } from "@/modules/identity/application/contracts";
import type { AuthorizationMembership } from "@/modules/identity";
import type { DatabaseClient } from "@/shared/db/client";

import { COMMAND_CENTER_PERMISSIONS } from "./permissions";

export type CommandCenterWorkspaceOption = Readonly<{
  id: string;
  name: string;
  operatorOrganizationId: string;
  clientOrganizationId: string;
  brandId: string | null;
}>;

export async function listAuthorizedCommandCenterWorkspaces(
  dependencies: Readonly<{
    database: DatabaseClient;
    authorizationStore: AuthorizationMembershipStore;
  }>,
  input: Readonly<{
    userId: string;
    operatorOrganizationId: string;
  }>,
): Promise<CommandCenterWorkspaceOption[]> {
  const memberships = await dependencies.authorizationStore.listActiveMemberships(
    input.userId,
    input.operatorOrganizationId,
  );
  const filters = memberships
    .filter((membership) =>
      membership.permissionKeys.includes(COMMAND_CENTER_PERMISSIONS.read),
    )
    .map(workspaceFilterForMembership)
    .filter((filter): filter is NonNullable<typeof filter> => filter !== null);

  if (filters.length === 0) return [];

  return dependencies.database.workspace.findMany({
    where: {
      status: "ACTIVE",
      operatorOrganizationId: input.operatorOrganizationId,
      OR: filters,
    },
    orderBy: [{ clientOrganizationId: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      operatorOrganizationId: true,
      clientOrganizationId: true,
      brandId: true,
    },
  });
}

function workspaceFilterForMembership(membership: AuthorizationMembership) {
  switch (membership.scope) {
    case "OPERATOR":
      return { operatorOrganizationId: membership.operatorOrganizationId };
    case "CLIENT":
      return membership.clientOrganizationId
        ? {
            operatorOrganizationId: membership.operatorOrganizationId,
            clientOrganizationId: membership.clientOrganizationId,
          }
        : null;
    case "BRAND":
      return membership.clientOrganizationId && membership.brandId
        ? {
            operatorOrganizationId: membership.operatorOrganizationId,
            clientOrganizationId: membership.clientOrganizationId,
            brandId: membership.brandId,
          }
        : null;
    case "WORKSPACE":
      return membership.clientOrganizationId && membership.workspaceId
        ? {
            operatorOrganizationId: membership.operatorOrganizationId,
            clientOrganizationId: membership.clientOrganizationId,
            id: membership.workspaceId,
          }
        : null;
  }
}
