import { z } from "zod";

const tenantContextSchema = z
  .object({
    operatorOrganizationId: z.uuid(),
    clientOrganizationId: z.uuid().optional(),
    brandId: z.uuid().optional(),
    workspaceId: z.uuid().optional(),
  })
  .strict()
  .superRefine((context, refinement) => {
    if (context.brandId && !context.clientOrganizationId) {
      refinement.addIssue({
        code: "custom",
        message: "brandId requires clientOrganizationId",
        path: ["brandId"],
      });
    }

    if (context.workspaceId && !context.clientOrganizationId) {
      refinement.addIssue({
        code: "custom",
        message: "workspaceId requires clientOrganizationId",
        path: ["workspaceId"],
      });
    }
  });

export type TenantContext = Readonly<z.infer<typeof tenantContextSchema>>;

export type ScopedResource = Readonly<Partial<TenantContext>> &
  Pick<TenantContext, "operatorOrganizationId">;

export function parseTenantContext(input: unknown): TenantContext {
  return Object.freeze(tenantContextSchema.parse(input));
}

export function assertResourceInTenant(
  context: TenantContext,
  resource: ScopedResource,
): void {
  const scopeKeys = [
    "operatorOrganizationId",
    "clientOrganizationId",
    "brandId",
    "workspaceId",
  ] as const;

  for (const key of scopeKeys) {
    const expected = context[key];
    const received = resource[key];

    if (received !== undefined && received !== expected) {
      throw new TenantScopeMismatchError(key);
    }
  }
}

export class TenantScopeMismatchError extends Error {
  constructor(scope: keyof TenantContext) {
    super(`Resource is outside the authorized ${scope} scope.`);
    this.name = "TenantScopeMismatchError";
  }
}
