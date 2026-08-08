CREATE TYPE "ClientLifecycleState" AS ENUM (
  'INTAKE',
  'ACCESS_PENDING',
  'AUDIT',
  'TRACKING_REPAIR',
  'STRATEGY_READY',
  'LAUNCHING',
  'LEARNING',
  'OPTIMIZING',
  'SCALING',
  'STABLE_GROWTH',
  'AT_RISK',
  'PAUSED',
  'OFFBOARDING'
);

CREATE TABLE "growth_client_profiles" (
  "workspace_id" UUID NOT NULL,
  "lifecycle_state" "ClientLifecycleState" NOT NULL DEFAULT 'INTAKE',
  "primary_business_objective" VARCHAR(1000),
  "north_star_metric_id" VARCHAR(120),
  "financial_currency" CHAR(3) NOT NULL DEFAULT 'BRL',
  "average_ticket" DECIMAL(24, 8),
  "monthly_media_budget" DECIMAL(24, 8),
  "sales_cycle_days" INTEGER,
  "capacity_notes" TEXT,
  "seasonality_notes" TEXT,
  "handover_source" VARCHAR(120),
  "created_by_user_id" UUID NOT NULL,
  "updated_by_user_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "growth_client_profiles_pkey" PRIMARY KEY ("workspace_id"),
  CONSTRAINT "growth_client_profiles_average_ticket_check" CHECK ("average_ticket" IS NULL OR "average_ticket" >= 0),
  CONSTRAINT "growth_client_profiles_monthly_media_budget_check" CHECK ("monthly_media_budget" IS NULL OR "monthly_media_budget" >= 0),
  CONSTRAINT "growth_client_profiles_sales_cycle_days_check" CHECK ("sales_cycle_days" IS NULL OR "sales_cycle_days" >= 0),
  CONSTRAINT "growth_client_profiles_workspace_fk" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "growth_client_profiles_created_by_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "growth_client_profiles_updated_by_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "growth_client_lifecycle_transitions" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "from_state" "ClientLifecycleState",
  "to_state" "ClientLifecycleState" NOT NULL,
  "reason" VARCHAR(1000) NOT NULL,
  "actor_user_id" UUID NOT NULL,
  "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "growth_client_lifecycle_transitions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "growth_client_lifecycle_transitions_reason_check" CHECK (char_length(trim("reason")) >= 3),
  CONSTRAINT "growth_client_lifecycle_transitions_workspace_fk" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "growth_client_lifecycle_transitions_actor_fk" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "growth_client_profiles_lifecycle_state_idx"
  ON "growth_client_profiles"("lifecycle_state", "updated_at" DESC);

CREATE INDEX "growth_client_lifecycle_transitions_workspace_occurred_idx"
  ON "growth_client_lifecycle_transitions"("workspace_id", "occurred_at" DESC);

CREATE INDEX "growth_client_lifecycle_transitions_actor_occurred_idx"
  ON "growth_client_lifecycle_transitions"("actor_user_id", "occurred_at" DESC);
