import { authorize } from "@/modules/identity";
import type { AuthorizationMembershipStore } from "@/modules/identity/application/contracts";
import { parseTenantContext, type TenantContext } from "@/modules/tenancy";
import type { DatabaseClient } from "@/shared/db/client";

import { COMMAND_CENTER_PERMISSIONS } from "./permissions";
import {
  loadCommandCenterSnapshot,
  type CommandCenterSnapshot,
} from "./query";

export class CommandCenterWorkspaceRequiredError extends Error {
  constructor() {
    super("Command Center requires an explicit workspace tenant context.");
    this.name = "CommandCenterWorkspaceRequiredError";
  }
}

export async function loadAuthorizedCommandCenterSnapshot(
  dependencies: Readonly<{
    database: DatabaseClient;
    authorizationStore: AuthorizationMembershipStore;
  }>,
  input: Readonly<{
    userId: string;
    tenant: TenantContext;
    from: Date;
    to: Date;
  }>,
): Promise<CommandCenterSnapshot> {
  const tenant = parseTenantContext(input.tenant);
  if (!tenant.workspaceId) throw new CommandCenterWorkspaceRequiredError();

  await authorize(dependencies.authorizationStore, {
    userId: input.userId,
    tenant,
    permission: COMMAND_CENTER_PERMISSIONS.read,
  });

  return loadCommandCenterSnapshot(dependencies.database, {
    workspaceId: tenant.workspaceId,
    from: input.from,
    to: input.to,
  });
}
