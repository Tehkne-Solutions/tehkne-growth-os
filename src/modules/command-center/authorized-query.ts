import { authorize } from "@/modules/identity";
import type { AuthorizationMembershipStore } from "@/modules/identity/application/contracts";
import { parseTenantContext, type TenantContext } from "@/modules/tenancy";
import type { DatabaseClient } from "@/shared/db/client";

import {
  compareCommandCenterSnapshots,
  previousEquivalentPeriod,
  type CommandCenterIntelligence,
} from "./intelligence";
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
  const workspaceId = await authorizeWorkspace(dependencies.authorizationStore, input);

  return loadCommandCenterSnapshot(dependencies.database, {
    workspaceId,
    from: input.from,
    to: input.to,
  });
}

export async function loadAuthorizedCommandCenterIntelligence(
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
): Promise<CommandCenterIntelligence> {
  const workspaceId = await authorizeWorkspace(dependencies.authorizationStore, input);
  const previous = previousEquivalentPeriod({ from: input.from, to: input.to });

  const [currentSnapshot, previousSnapshot] = await Promise.all([
    loadCommandCenterSnapshot(dependencies.database, {
      workspaceId,
      from: input.from,
      to: input.to,
    }),
    loadCommandCenterSnapshot(dependencies.database, {
      workspaceId,
      from: previous.from,
      to: previous.to,
    }),
  ]);

  return compareCommandCenterSnapshots(currentSnapshot, previousSnapshot);
}

async function authorizeWorkspace(
  authorizationStore: AuthorizationMembershipStore,
  input: Readonly<{
    userId: string;
    tenant: TenantContext;
    from: Date;
    to: Date;
  }>,
): Promise<string> {
  const tenant = parseTenantContext(input.tenant);
  if (!tenant.workspaceId) throw new CommandCenterWorkspaceRequiredError();

  await authorize(authorizationStore, {
    userId: input.userId,
    tenant,
    permission: COMMAND_CENTER_PERMISSIONS.read,
  });

  return tenant.workspaceId;
}
