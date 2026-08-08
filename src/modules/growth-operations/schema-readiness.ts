import type { DatabaseClient } from "@/shared/db/client";

export type SchemaReadiness = {
  databaseConnected: true;
  prismaMigrationsTable: boolean;
  operatorOrganizationsTable: boolean;
  clientOrganizationsTable: boolean;
  workspacesTable: boolean;
  auditEventsTable: boolean;
  completedMigrationCount: number;
  schemaReady: boolean;
};

type TableProbe = {
  prisma_migrations: string | null;
  operator_organizations: string | null;
  client_organizations: string | null;
  workspaces: string | null;
  audit_events: string | null;
};

type MigrationCount = {
  count: bigint;
};

export async function getSchemaReadiness(database: DatabaseClient): Promise<SchemaReadiness> {
  const [probe] = await database.$queryRaw<TableProbe[]>`
    SELECT
      to_regclass('public._prisma_migrations')::text AS prisma_migrations,
      to_regclass('public.operator_organizations')::text AS operator_organizations,
      to_regclass('public.client_organizations')::text AS client_organizations,
      to_regclass('public.workspaces')::text AS workspaces,
      to_regclass('public.audit_events')::text AS audit_events
  `;

  const prismaMigrationsTable = Boolean(probe?.prisma_migrations);
  const operatorOrganizationsTable = Boolean(probe?.operator_organizations);
  const clientOrganizationsTable = Boolean(probe?.client_organizations);
  const workspacesTable = Boolean(probe?.workspaces);
  const auditEventsTable = Boolean(probe?.audit_events);

  let completedMigrationCount = 0;
  if (prismaMigrationsTable) {
    const [migrationCount] = await database.$queryRaw<MigrationCount[]>`
      SELECT COUNT(*)::bigint AS count
      FROM "_prisma_migrations"
      WHERE finished_at IS NOT NULL
        AND rolled_back_at IS NULL
    `;
    completedMigrationCount = Number(migrationCount?.count ?? 0n);
  }

  const schemaReady =
    prismaMigrationsTable &&
    operatorOrganizationsTable &&
    clientOrganizationsTable &&
    workspacesTable &&
    auditEventsTable &&
    completedMigrationCount > 0;

  return {
    databaseConnected: true,
    prismaMigrationsTable,
    operatorOrganizationsTable,
    clientOrganizationsTable,
    workspacesTable,
    auditEventsTable,
    completedMigrationCount,
    schemaReady,
  };
}
