import { readFileSync, readdirSync, statSync } from "node:fs";
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

  it("keeps generated database imports inside the shared database boundary", () => {
    const sourceRoot = resolve("src");
    const databaseBoundary = resolve("src/shared/db");
    const generatedBoundary = resolve("src/generated");
    const pending = [sourceRoot];
    const violations: string[] = [];

    while (pending.length > 0) {
      const directory = pending.pop();
      if (!directory) continue;

      for (const entry of readdirSync(directory)) {
        const path = resolve(directory, entry);
        if (path.startsWith(generatedBoundary)) continue;
        if (statSync(path).isDirectory()) {
          pending.push(path);
          continue;
        }
        if (
          !path.startsWith(databaseBoundary) &&
          readFileSync(path, "utf8").includes("@/generated/prisma")
        ) {
          violations.push(path);
        }
      }
    }

    expect(violations).toEqual([]);
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

  it("ships revocable sessions and single-use invitation constraints", () => {
    const migration = readFileSync(
      resolve(
        "prisma/migrations/20260802150000_identity_sessions_invitations/migration.sql",
      ),
      "utf8",
    );

    expect(migration).toContain("password_credentials");
    expect(migration).toContain("sessions_revocation_check");
    expect(migration).toContain("invitations_lifecycle_check");
    expect(migration).toContain("invitations_tenant_hierarchy_trigger");
    expect(migration).toContain("users_email_normalized_key");
    expect(migration).toContain("sessions_expiry_check");
  });
});
