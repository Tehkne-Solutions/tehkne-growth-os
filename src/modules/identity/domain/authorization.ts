import type { TenantContext } from "@/modules/tenancy";

export type AccessScope = "OPERATOR" | "CLIENT" | "BRAND" | "WORKSPACE";

export type AuthorizationMembership = Readonly<{
  id: string;
  scope: AccessScope;
  operatorOrganizationId: string;
  clientOrganizationId?: string;
  brandId?: string;
  workspaceId?: string;
  permissionKeys: readonly string[];
}>;

export type AuthorizationContext = Readonly<{
  userId: string;
  tenant: TenantContext;
  membershipIds: readonly string[];
  permissions: PermissionCollection;
}>;

export interface PermissionCollection extends Iterable<string> {
  readonly size: number;
  has(value: string): boolean;
  values(): Iterator<string>;
}

export class AuthorizationDeniedError extends Error {
  constructor() {
    super("The authenticated user is not authorized for this operation.");
    this.name = "AuthorizationDeniedError";
  }
}

class ImmutablePermissionSet implements PermissionCollection {
  readonly #values: Set<string>;

  constructor(values: Iterable<string>) {
    this.#values = new Set(values);
    Object.freeze(this);
  }

  get size(): number {
    return this.#values.size;
  }

  has(value: string): boolean {
    return this.#values.has(value);
  }

  entries(): SetIterator<[string, string]> {
    return this.#values.entries();
  }

  keys(): SetIterator<string> {
    return this.#values.keys();
  }

  values(): SetIterator<string> {
    return this.#values.values();
  }

  forEach(
    callbackfn: (
      value: string,
      value2: string,
      set: PermissionCollection,
    ) => void,
    thisArg?: unknown,
  ): void {
    for (const value of this.#values) {
      callbackfn.call(thisArg, value, value, this);
    }
  }

  [Symbol.iterator](): SetIterator<string> {
    return this.values();
  }

  get [Symbol.toStringTag](): string {
    return "ImmutablePermissionSet";
  }
}

export function membershipCoversTenant(
  membership: AuthorizationMembership,
  tenant: TenantContext,
): boolean {
  if (membership.operatorOrganizationId !== tenant.operatorOrganizationId) {
    return false;
  }

  switch (membership.scope) {
    case "OPERATOR":
      return true;
    case "CLIENT":
      return (
        membership.clientOrganizationId !== undefined &&
        membership.clientOrganizationId === tenant.clientOrganizationId
      );
    case "BRAND":
      return (
        membership.clientOrganizationId !== undefined &&
        membership.clientOrganizationId === tenant.clientOrganizationId &&
        membership.brandId !== undefined &&
        membership.brandId === tenant.brandId
      );
    case "WORKSPACE":
      return (
        membership.clientOrganizationId !== undefined &&
        membership.clientOrganizationId === tenant.clientOrganizationId &&
        membership.workspaceId !== undefined &&
        membership.workspaceId === tenant.workspaceId &&
        (membership.brandId === undefined ||
          membership.brandId === tenant.brandId)
      );
  }
}

export function buildAuthorizationContext(
  userId: string,
  tenant: TenantContext,
  memberships: readonly AuthorizationMembership[],
): AuthorizationContext {
  const coveringMemberships = memberships.filter((membership) =>
    membershipCoversTenant(membership, tenant),
  );

  return Object.freeze({
    userId,
    tenant,
    membershipIds: Object.freeze(
      coveringMemberships.map((membership) => membership.id),
    ),
    permissions: new ImmutablePermissionSet(
      coveringMemberships.flatMap((membership) => membership.permissionKeys),
    ),
  });
}

export function assertPermission(
  context: AuthorizationContext,
  permission: string,
): void {
  if (!context.permissions.has(permission)) {
    throw new AuthorizationDeniedError();
  }
}

export function assertRoleGrantAllowed(
  context: AuthorizationContext,
  targetRolePermissions: readonly string[],
  assignAnyPermission: string,
): void {
  if (context.permissions.has(assignAnyPermission)) {
    return;
  }

  if (
    targetRolePermissions.some(
      (permission) => !context.permissions.has(permission),
    )
  ) {
    throw new AuthorizationDeniedError();
  }
}
