CREATE TYPE "InvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED');

CREATE TABLE "password_credentials" (
  "user_id" UUID NOT NULL,
  "password_hash" TEXT NOT NULL,
  "failed_attempts" INTEGER NOT NULL DEFAULT 0,
  "locked_until" TIMESTAMPTZ(6),
  "last_used_at" TIMESTAMPTZ(6),
  "password_changed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "password_credentials_pkey" PRIMARY KEY ("user_id"),
  CONSTRAINT "password_credentials_failed_attempts_check" CHECK ("failed_attempts" >= 0)
);

CREATE TABLE "sessions" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "token_hash" CHAR(64) NOT NULL,
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "last_seen_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revoked_at" TIMESTAMPTZ(6),
  "revoke_reason" VARCHAR(120),
  "user_agent_hash" CHAR(64),
  "ip_prefix" VARCHAR(64),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sessions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sessions_expiry_check" CHECK ("expires_at" > "created_at"),
  CONSTRAINT "sessions_revocation_check" CHECK (
    ("revoked_at" IS NULL AND "revoke_reason" IS NULL)
    OR ("revoked_at" IS NOT NULL)
  )
);

CREATE TABLE "invitations" (
  "id" UUID NOT NULL,
  "token_hash" CHAR(64) NOT NULL,
  "email" VARCHAR(320) NOT NULL,
  "role_id" UUID NOT NULL,
  "operator_organization_id" UUID NOT NULL,
  "client_organization_id" UUID,
  "brand_id" UUID,
  "workspace_id" UUID,
  "scope" "MembershipScope" NOT NULL,
  "status" "InvitationStatus" NOT NULL DEFAULT 'PENDING',
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "accepted_at" TIMESTAMPTZ(6),
  "revoked_at" TIMESTAMPTZ(6),
  "invited_by_user_id" UUID NOT NULL,
  "accepted_by_user_id" UUID,
  "membership_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "invitations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "invitations_email_normalized_check" CHECK ("email" = LOWER(BTRIM("email"))),
  CONSTRAINT "invitations_expiry_check" CHECK ("expires_at" > "created_at"),
  CONSTRAINT "invitations_scope_shape_check" CHECK (
    ("scope" = 'OPERATOR' AND "client_organization_id" IS NULL AND "brand_id" IS NULL AND "workspace_id" IS NULL)
    OR ("scope" = 'CLIENT' AND "client_organization_id" IS NOT NULL AND "brand_id" IS NULL AND "workspace_id" IS NULL)
    OR ("scope" = 'BRAND' AND "client_organization_id" IS NOT NULL AND "brand_id" IS NOT NULL AND "workspace_id" IS NULL)
    OR ("scope" = 'WORKSPACE' AND "client_organization_id" IS NOT NULL AND "workspace_id" IS NOT NULL)
  ),
  CONSTRAINT "invitations_lifecycle_check" CHECK (
    ("status" = 'PENDING' AND "accepted_at" IS NULL AND "revoked_at" IS NULL AND "accepted_by_user_id" IS NULL AND "membership_id" IS NULL)
    OR ("status" = 'ACCEPTED' AND "accepted_at" IS NOT NULL AND "revoked_at" IS NULL AND "accepted_by_user_id" IS NOT NULL AND "membership_id" IS NOT NULL)
    OR ("status" = 'REVOKED' AND "accepted_at" IS NULL AND "revoked_at" IS NOT NULL AND "accepted_by_user_id" IS NULL AND "membership_id" IS NULL)
    OR ("status" = 'EXPIRED' AND "accepted_at" IS NULL AND "revoked_at" IS NULL AND "accepted_by_user_id" IS NULL AND "membership_id" IS NULL)
  )
);

CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");
CREATE INDEX "sessions_user_revoked_expires_idx" ON "sessions"("user_id", "revoked_at", "expires_at");
CREATE INDEX "sessions_expires_at_idx" ON "sessions"("expires_at");
CREATE UNIQUE INDEX "invitations_token_hash_key" ON "invitations"("token_hash");
CREATE UNIQUE INDEX "invitations_membership_id_key" ON "invitations"("membership_id");
CREATE INDEX "invitations_email_status_expires_idx" ON "invitations"("email", "status", "expires_at");
CREATE INDEX "invitations_tenant_status_idx" ON "invitations"("operator_organization_id", "client_organization_id", "workspace_id", "status");
CREATE UNIQUE INDEX "users_email_normalized_key" ON "users"(LOWER("email"));
ALTER TABLE "users" ADD CONSTRAINT "users_email_normalized_check" CHECK ("email" = LOWER(BTRIM("email")));

ALTER TABLE "password_credentials"
  ADD CONSTRAINT "password_credentials_user_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "sessions"
  ADD CONSTRAINT "sessions_user_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "invitations"
  ADD CONSTRAINT "invitations_role_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "invitations_operator_fkey" FOREIGN KEY ("operator_organization_id") REFERENCES "operator_organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "invitations_client_fkey" FOREIGN KEY ("client_organization_id") REFERENCES "client_organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "invitations_brand_fkey" FOREIGN KEY ("brand_id") REFERENCES "brands"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "invitations_workspace_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "invitations_inviter_fkey" FOREIGN KEY ("invited_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "invitations_acceptor_fkey" FOREIGN KEY ("accepted_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "invitations_membership_fkey" FOREIGN KEY ("membership_id") REFERENCES "memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION "assert_tenant_hierarchy"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  resolved_operator_id UUID;
  resolved_client_id UUID;
  resolved_brand_id UUID;
  resolved_role_operator_id UUID;
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

  IF TG_TABLE_NAME IN ('workspaces', 'memberships', 'invitations') AND NEW."brand_id" IS NOT NULL THEN
    SELECT "client_organization_id", "operator_organization_id"
      INTO resolved_client_id, resolved_operator_id
      FROM "brands"
      WHERE "id" = NEW."brand_id";

    IF resolved_client_id IS DISTINCT FROM NEW."client_organization_id"
      OR resolved_operator_id IS DISTINCT FROM NEW."operator_organization_id" THEN
      RAISE EXCEPTION 'brand is outside the client tenant';
    END IF;
  END IF;

  IF TG_TABLE_NAME IN ('memberships', 'audit_events', 'invitations') AND NEW."workspace_id" IS NOT NULL THEN
    SELECT "client_organization_id", "operator_organization_id", "brand_id"
      INTO resolved_client_id, resolved_operator_id, resolved_brand_id
      FROM "workspaces"
      WHERE "id" = NEW."workspace_id";

    IF resolved_client_id IS DISTINCT FROM NEW."client_organization_id"
      OR resolved_operator_id IS DISTINCT FROM NEW."operator_organization_id" THEN
      RAISE EXCEPTION 'workspace is outside the authorized tenant scope';
    END IF;

    IF TG_TABLE_NAME IN ('memberships', 'invitations')
      AND NEW."brand_id" IS NOT NULL
      AND resolved_brand_id IS DISTINCT FROM NEW."brand_id" THEN
      RAISE EXCEPTION 'workspace brand differs from access scope brand';
    END IF;
  END IF;

  IF TG_TABLE_NAME = 'invitations' THEN
    SELECT "operator_organization_id"
      INTO resolved_role_operator_id
      FROM "roles"
      WHERE "id" = NEW."role_id";

    IF resolved_role_operator_id IS NOT NULL
      AND resolved_role_operator_id IS DISTINCT FROM NEW."operator_organization_id" THEN
      RAISE EXCEPTION 'invitation role is outside the operator tenant';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "invitations_tenant_hierarchy_trigger"
  BEFORE INSERT OR UPDATE OF "operator_organization_id", "client_organization_id", "brand_id", "workspace_id", "role_id"
  ON "invitations" FOR EACH ROW EXECUTE FUNCTION "assert_tenant_hierarchy"();
