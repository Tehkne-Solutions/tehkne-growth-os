import type { TenantContext } from "@/modules/tenancy";

import type {
  AcceptedInvitation,
  InvitationStore,
  NewInvitationRecord,
} from "./contracts";
import type { AccessScope } from "../domain/authorization";
import { normalizeEmail } from "../domain/email";
import { createOpaqueToken, digestOpaqueToken } from "../domain/opaque-token";
import { hashPassword } from "../domain/password";

const DEFAULT_INVITATION_TTL_MS = 72 * 60 * 60 * 1000;
const MAX_INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export class InvalidInvitationScopeError extends Error {
  constructor() {
    super("The invitation scope does not match its tenant context.");
    this.name = "InvalidInvitationScopeError";
  }
}

function digestInvitationToken(token: string, secret: string): string {
  return digestOpaqueToken(`invitation:${token}`, secret);
}

function assertInvitationScope(
  scope: AccessScope,
  tenant: TenantContext,
): void {
  const valid =
    (scope === "OPERATOR" &&
      !tenant.clientOrganizationId &&
      !tenant.brandId &&
      !tenant.workspaceId) ||
    (scope === "CLIENT" &&
      Boolean(tenant.clientOrganizationId) &&
      !tenant.brandId &&
      !tenant.workspaceId) ||
    (scope === "BRAND" &&
      Boolean(tenant.clientOrganizationId) &&
      Boolean(tenant.brandId) &&
      !tenant.workspaceId) ||
    (scope === "WORKSPACE" &&
      Boolean(tenant.clientOrganizationId) &&
      Boolean(tenant.workspaceId));

  if (!valid) {
    throw new InvalidInvitationScopeError();
  }
}

export async function createInvitation(
  store: InvitationStore,
  input: Readonly<{
    email: string;
    roleId: string;
    scope: AccessScope;
    tenant: TenantContext;
    invitedByUserId: string;
    secret: string;
    ttlMs?: number;
  }>,
  now = new Date(),
): Promise<Readonly<{ id: string; token: string; expiresAt: Date }>> {
  assertInvitationScope(input.scope, input.tenant);

  const ttlMs = input.ttlMs ?? DEFAULT_INVITATION_TTL_MS;
  if (ttlMs <= 0 || ttlMs > MAX_INVITATION_TTL_MS) {
    throw new Error("Invitation TTL must be between 1 ms and 7 days.");
  }

  const token = createOpaqueToken();
  const expiresAt = new Date(now.getTime() + ttlMs);
  const record: NewInvitationRecord = {
    tokenHash: digestInvitationToken(token, input.secret),
    email: normalizeEmail(input.email),
    roleId: input.roleId,
    operatorOrganizationId: input.tenant.operatorOrganizationId,
    clientOrganizationId: input.tenant.clientOrganizationId ?? null,
    brandId: input.tenant.brandId ?? null,
    workspaceId: input.tenant.workspaceId ?? null,
    scope: input.scope,
    expiresAt,
    invitedByUserId: input.invitedByUserId,
  };
  const created = await store.createInvitation(record);

  return Object.freeze({ id: created.id, token, expiresAt });
}

export async function acceptInvitation(
  store: InvitationStore,
  input: Readonly<{
    token: string;
    secret: string;
    currentUserId?: string | null;
    name?: string | null;
    password?: string | null;
  }>,
  now = new Date(),
): Promise<AcceptedInvitation> {
  const passwordHash = input.password
    ? await hashPassword(input.password)
    : null;

  return store.acceptInvitation({
    tokenHash: digestInvitationToken(input.token, input.secret),
    acceptedAt: now,
    currentUserId: input.currentUserId ?? null,
    name: input.name?.trim() || null,
    passwordHash,
  });
}
