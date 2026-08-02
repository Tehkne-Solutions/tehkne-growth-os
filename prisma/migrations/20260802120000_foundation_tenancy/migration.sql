CREATE SCHEMA IF NOT EXISTS "public";

CREATE TYPE "RecordStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'ARCHIVED');
CREATE TYPE "MembershipScope" AS ENUM ('OPERATOR', 'CLIENT', 'BRAND', 'WORKSPACE');
CREATE TYPE "MembershipStatus" AS ENUM ('INVITED', 'ACTIVE', 'SUSPENDED', 'REVOKED');
CREATE TYPE "WorkspaceKind" AS ENUM ('GROWTH_OPERATIONS', 'CLIENT_PORTAL', 'INTERNAL');

CREATE TABLE "operator_organizations" (
  "id" UUID NOT NULL,
  "slug" VARCHAR(80) NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
  "timezone" VARCHAR(80) NOT NULL DEFAULT 'America/Sao_Paulo',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "operator_organizations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "client_organizations" (
  "id" UUID NOT NULL,
  "operator_organization_id" UUID NOT NULL,
  "slug" VARCHAR(80) NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "legal_name" VARCHAR(200),
  "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
  "locale" VARCHAR(20) NOT NULL DEFAULT 'pt-BR',
  "currency" CHAR(3) DEFAULT 'BRL',
  "timezone" VARCHAR(80) NOT NULL DEFAULT 'America/Sao_Paulo',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "client_organizations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "brands" (
  "id" UUID NOT NULL,
  "operator_organization_id" UUID NOT NULL,
  "client_organization_id" UUID NOT NULL,
  "slug" VARCHAR(80) NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "brands_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "workspaces" (
  "id" UUID NOT NULL,
  "operator_organization_id" UUID NOT NULL,
  "client_organization_id" UUID NOT NULL,
  "brand_id" UUID,
  "slug" VARCHAR(80) NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "kind" "WorkspaceKind" NOT NULL DEFAULT 'GROWTH_OPERATIONS',
  "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "users" (
  "id" UUID NOT NULL,
  "email" VARCHAR(320) NOT NULL,
  "name" VARCHAR(160),
  "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "roles" (
  "id" UUID NOT NULL,
  "operator_organization_id" UUID,
  "code" VARCHAR(80) NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "description" VARCHAR(500),
  "is_system" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "roles_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "roles_system_scope_check" CHECK (
    ("is_system" = TRUE AND "operator_organization_id" IS NULL)
    OR ("is_system" = FALSE AND "operator_organization_id" IS NOT NULL)
  )
);

CREATE TABLE "permissions" (
  "id" UUID NOT NULL,
  "key" VARCHAR(120) NOT NULL,
  "description" VARCHAR(500) NOT NULL,
  CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "role_permissions" (
  "role_id" UUID NOT NULL,
  "permission_id" UUID NOT NULL,
  CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id", "permission_id")
);

CREATE TABLE "memberships" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "role_id" UUID NOT NULL,
  "operator_organization_id" UUID NOT NULL,
  "client_organization_id" UUID,
  "brand_id" UUID,
  "workspace_id" UUID,
  "scope" "MembershipScope" NOT NULL,
  "status" "MembershipStatus" NOT NULL DEFAULT 'INVITED',
  "activated_at" TIMESTAMPTZ(6),
  "revoked_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "memberships_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "memberships_scope_shape_check" CHECK (
    ("scope" = 'OPERATOR' AND "client_organization_id" IS NULL AND "brand_id" IS NULL AND "workspace_id" IS NULL)
    OR ("scope" = 'CLIENT' AND "client_organization_id" IS NOT NULL AND "brand_id" IS NULL AND "workspace_id" IS NULL)
    OR ("scope" = 'BRAND' AND "client_organization_id" IS NOT NULL AND "brand_id" IS NOT NULL AND "workspace_id" IS NULL)
    OR ("scope" = 'WORKSPACE' AND "client_organization_id" IS NOT NULL AND "workspace_id" IS NOT NULL)
  ),
  CONSTRAINT "memberships_activation_check" CHECK (
    ("status" = 'ACTIVE' AND "activated_at" IS NOT NULL AND "revoked_at" IS NULL)
    OR ("status" = 'REVOKED' AND "revoked_at" IS NOT NULL)
    OR ("status" IN ('INVITED', 'SUSPENDED'))
  )
);

CREATE TABLE "audit_events" (
  "id" UUID NOT NULL,
  "operator_organization_id" UUID NOT NULL,
  "client_organization_id" UUID,
  "workspace_id" UUID,
  "actor_user_id" UUID,
  "action" VARCHAR(120) NOT NULL,
  "resource_type" VARCHAR(120) NOT NULL,
  "resource_id" VARCHAR(160),
  "request_id" VARCHAR(160),
  "metadata" JSONB,
  "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "audit_events_scope_shape_check" CHECK (
    "workspace_id" IS NULL OR "client_organization_id" IS NOT NULL
  )
);

CREATE UNIQUE INDEX "operator_organizations_slug_key" ON "operator_organizations"("slug");
CREATE INDEX "client_organizations_operator_status_idx" ON "client_organizations"("operator_organization_id", "status");
CREATE UNIQUE INDEX "client_organizations_operator_slug_key" ON "client_organizations"("operator_organization_id", "slug");
CREATE UNIQUE INDEX "client_organizations_id_operator_key" ON "client_organizations"("id", "operator_organization_id");
CREATE INDEX "brands_operator_client_status_idx" ON "brands"("operator_organization_id", "client_organization_id", "status");
CREATE UNIQUE INDEX "brands_client_slug_key" ON "brands"("client_organization_id", "slug");
CREATE UNIQUE INDEX "brands_id_client_operator_key" ON "brands"("id", "client_organization_id", "operator_organization_id");
CREATE INDEX "workspaces_operator_client_status_idx" ON "workspaces"("operator_organization_id", "client_organization_id", "status");
CREATE UNIQUE INDEX "workspaces_client_slug_key" ON "workspaces"("client_organization_id", "slug");
CREATE UNIQUE INDEX "workspaces_id_client_operator_key" ON "workspaces"("id", "client_organization_id", "operator_organization_id");
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE UNIQUE INDEX "roles_operator_code_key" ON "roles"("operator_organization_id", "code");
CREATE UNIQUE INDEX "roles_system_code_key" ON "roles"("code") WHERE "operator_organization_id" IS NULL;
CREATE UNIQUE INDEX "permissions_key_key" ON "permissions"("key");
CREATE INDEX "memberships_user_status_idx" ON "memberships"("user_id", "status");
CREATE INDEX "memberships_tenant_status_idx" ON "memberships"("operator_organization_id", "client_organization_id", "workspace_id", "status");
CREATE UNIQUE INDEX "memberships_operator_scope_key" ON "memberships"("user_id", "role_id", "operator_organization_id") WHERE "scope" = 'OPERATOR';
CREATE UNIQUE INDEX "memberships_client_scope_key" ON "memberships"("user_id", "role_id", "operator_organization_id", "client_organization_id") WHERE "scope" = 'CLIENT';
CREATE UNIQUE INDEX "memberships_brand_scope_key" ON "memberships"("user_id", "role_id", "operator_organization_id", "client_organization_id", "brand_id") WHERE "scope" = 'BRAND';
CREATE UNIQUE INDEX "memberships_workspace_scope_key" ON "memberships"("user_id", "role_id", "operator_organization_id", "client_organization_id", "workspace_id") WHERE "scope" = 'WORKSPACE';
CREATE UNIQUE INDEX "memberships_scope_identity_key" ON "memberships"("user_id", "role_id", "operator_organization_id", "client_organization_id", "brand_id", "workspace_id");
CREATE INDEX "audit_events_operator_occurred_idx" ON "audit_events"("operator_organization_id", "occurred_at");
CREATE INDEX "audit_events_client_occurred_idx" ON "audit_events"("client_organization_id", "occurred_at");
CREATE INDEX "audit_events_workspace_occurred_idx" ON "audit_events"("workspace_id", "occurred_at");

ALTER TABLE "client_organizations"
  ADD CONSTRAINT "client_organizations_operator_fkey" FOREIGN KEY ("operator_organization_id") REFERENCES "operator_organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "brands"
  ADD CONSTRAINT "brands_operator_fkey" FOREIGN KEY ("operator_organization_id") REFERENCES "operator_organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "brands_client_fkey" FOREIGN KEY ("client_organization_id") REFERENCES "client_organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "workspaces"
  ADD CONSTRAINT "workspaces_operator_fkey" FOREIGN KEY ("operator_organization_id") REFERENCES "operator_organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "workspaces_client_fkey" FOREIGN KEY ("client_organization_id") REFERENCES "client_organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "workspaces_brand_fkey" FOREIGN KEY ("brand_id") REFERENCES "brands"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "roles"
  ADD CONSTRAINT "roles_operator_fkey" FOREIGN KEY ("operator_organization_id") REFERENCES "operator_organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "role_permissions"
  ADD CONSTRAINT "role_permissions_role_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "role_permissions_permission_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "memberships"
  ADD CONSTRAINT "memberships_user_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "memberships_role_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "memberships_operator_fkey" FOREIGN KEY ("operator_organization_id") REFERENCES "operator_organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "memberships_client_fkey" FOREIGN KEY ("client_organization_id") REFERENCES "client_organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "memberships_brand_fkey" FOREIGN KEY ("brand_id") REFERENCES "brands"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "memberships_workspace_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "audit_events"
  ADD CONSTRAINT "audit_events_operator_fkey" FOREIGN KEY ("operator_organization_id") REFERENCES "operator_organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "audit_events_client_fkey" FOREIGN KEY ("client_organization_id") REFERENCES "client_organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "audit_events_workspace_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "audit_events_actor_user_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Prisma does not model cross-table CHECK constraints. This trigger keeps every
-- redundant tenant key aligned while preserving a Prisma-compatible relational schema.
CREATE OR REPLACE FUNCTION "assert_tenant_hierarchy"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  resolved_operator_id UUID;
  resolved_client_id UUID;
  resolved_brand_id UUID;
BEGIN
  IF NEW."client_organization_id" IS NOT NULL THEN
    SELECT "operator_organization_id"
      INTO resolved_operator_id
      FROM "client_organizations"
      WHERE "id" = NEW."client_organization_id";

    IF resolved_operator_id IS DISTINCT FROM NEW."operator_organization_id" THEN
      RAISE EXCEPTION 'client organization is outside the operator tenant';
    END IF;
  END IF;

  IF TG_TABLE_NAME IN ('workspaces', 'memberships') THEN
    IF NEW."brand_id" IS NOT NULL THEN
      SELECT "client_organization_id", "operator_organization_id"
        INTO resolved_client_id, resolved_operator_id
        FROM "brands"
        WHERE "id" = NEW."brand_id";

      IF resolved_client_id IS DISTINCT FROM NEW."client_organization_id"
        OR resolved_operator_id IS DISTINCT FROM NEW."operator_organization_id" THEN
        RAISE EXCEPTION 'brand is outside the client tenant';
      END IF;
    END IF;
  END IF;

  IF TG_TABLE_NAME IN ('memberships', 'audit_events') AND NEW."workspace_id" IS NOT NULL THEN
    SELECT "client_organization_id", "operator_organization_id", "brand_id"
      INTO resolved_client_id, resolved_operator_id, resolved_brand_id
      FROM "workspaces"
      WHERE "id" = NEW."workspace_id";

    IF resolved_client_id IS DISTINCT FROM NEW."client_organization_id"
      OR resolved_operator_id IS DISTINCT FROM NEW."operator_organization_id" THEN
      RAISE EXCEPTION 'workspace is outside the authorized tenant scope';
    END IF;

    IF TG_TABLE_NAME = 'memberships' THEN
      IF NEW."brand_id" IS NOT NULL AND resolved_brand_id IS DISTINCT FROM NEW."brand_id" THEN
        RAISE EXCEPTION 'workspace brand differs from membership brand';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "brands_tenant_hierarchy_trigger"
  BEFORE INSERT OR UPDATE OF "operator_organization_id", "client_organization_id"
  ON "brands" FOR EACH ROW EXECUTE FUNCTION "assert_tenant_hierarchy"();

CREATE TRIGGER "workspaces_tenant_hierarchy_trigger"
  BEFORE INSERT OR UPDATE OF "operator_organization_id", "client_organization_id", "brand_id"
  ON "workspaces" FOR EACH ROW EXECUTE FUNCTION "assert_tenant_hierarchy"();

CREATE TRIGGER "memberships_tenant_hierarchy_trigger"
  BEFORE INSERT OR UPDATE OF "operator_organization_id", "client_organization_id", "brand_id", "workspace_id"
  ON "memberships" FOR EACH ROW EXECUTE FUNCTION "assert_tenant_hierarchy"();

CREATE TRIGGER "audit_events_tenant_hierarchy_trigger"
  BEFORE INSERT OR UPDATE OF "operator_organization_id", "client_organization_id", "workspace_id"
  ON "audit_events" FOR EACH ROW EXECUTE FUNCTION "assert_tenant_hierarchy"();
