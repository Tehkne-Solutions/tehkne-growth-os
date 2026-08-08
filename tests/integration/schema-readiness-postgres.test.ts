import { afterAll, describe, expect, it } from "vitest";

import { getSchemaReadiness } from "@/modules/growth-operations/schema-readiness";
import { getDatabase } from "@/shared/db/client";

const database = getDatabase();

describe("schema readiness PostgreSQL probe", () => {
  afterAll(async () => {
    await database.$disconnect();
  });

  it("detects the migrated Growth OS schema without exposing connection details", async () => {
    const readiness = await getSchemaReadiness(database);

    expect(readiness.databaseConnected).toBe(true);
    expect(readiness.prismaMigrationsTable).toBe(true);
    expect(readiness.operatorOrganizationsTable).toBe(true);
    expect(readiness.clientOrganizationsTable).toBe(true);
    expect(readiness.workspacesTable).toBe(true);
    expect(readiness.auditEventsTable).toBe(true);
    expect(readiness.completedMigrationCount).toBeGreaterThan(0);
    expect(readiness.schemaReady).toBe(true);
  });
});
