import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  bootstrapRcWorkspace,
  findRcWorkspace,
} from "@/modules/growth-operations/rc-workspace";
import { getDatabase } from "@/shared/db/client";

const database = getDatabase();

const ids = {
  operator: "91000000-0000-4000-8000-000000000001",
  client: "92000000-0000-4000-8000-000000000001",
  workspace: "93000000-0000-4000-8000-000000000001",
  audit: "94000000-0000-4000-8000-000000000001",
} as const;

async function cleanup() {
  await database.auditEvent.deleteMany({ where: { id: ids.audit } });
  await database.workspace.deleteMany({ where: { id: ids.workspace } });
  await database.clientOrganization.deleteMany({ where: { id: ids.client } });
  await database.operatorOrganization.deleteMany({ where: { id: ids.operator } });
}

describe("RC workspace PostgreSQL bootstrap", () => {
  beforeAll(cleanup);

  afterAll(async () => {
    await cleanup();
    await database.$disconnect();
  });

  it("returns null before the canonical workspace exists", async () => {
    await expect(findRcWorkspace(database)).resolves.toBeNull();
  });

  it("creates the canonical tenant hierarchy and is idempotent", async () => {
    const first = await bootstrapRcWorkspace(database);
    const second = await bootstrapRcWorkspace(database);

    expect(first).toEqual({
      id: ids.workspace,
      name: "RC Validation",
      slug: "rc-validation",
    });
    expect(second).toEqual(first);

    await expect(findRcWorkspace(database)).resolves.toEqual(first);

    expect(await database.operatorOrganization.count({ where: { id: ids.operator } })).toBe(1);
    expect(await database.clientOrganization.count({ where: { id: ids.client } })).toBe(1);
    expect(await database.workspace.count({ where: { id: ids.workspace } })).toBe(1);
    expect(await database.auditEvent.count({ where: { id: ids.audit } })).toBe(1);

    const audit = await database.auditEvent.findUniqueOrThrow({ where: { id: ids.audit } });
    expect(audit.action).toBe("rc.workspace.bootstrap");
    expect(audit.resourceId).toBe(ids.workspace);
    expect(audit.workspaceId).toBe(ids.workspace);
  });
});
