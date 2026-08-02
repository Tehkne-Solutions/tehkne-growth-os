import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("module boundaries", () => {
  it("keeps the generated Prisma client behind the shared database boundary", () => {
    const allowedImportBoundary = resolve("src/shared/db");
    const source = readFileSync(
      resolve("src/modules/tenancy/domain/tenant-context.ts"),
      "utf8",
    );

    expect(allowedImportBoundary).toContain(resolve("src/shared"));
    expect(source).not.toContain("generated/prisma");
  });

  it("models the complete tenant hierarchy in the database schema", () => {
    const schema = readFileSync(resolve("prisma/schema.prisma"), "utf8");

    for (const model of [
      "OperatorOrganization",
      "ClientOrganization",
      "Brand",
      "Workspace",
      "Membership",
    ]) {
      expect(schema).toContain(`model ${model}`);
    }
  });

  it("ships database-level scope constraints with the initial migration", () => {
    const migration = readFileSync(
      resolve(
        "prisma/migrations/20260802120000_foundation_tenancy/migration.sql",
      ),
      "utf8",
    );

    expect(migration).toContain("memberships_scope_shape_check");
    expect(migration).toContain("assert_tenant_hierarchy");
    expect(migration).toContain("memberships_workspace_scope_key");
  });
});
