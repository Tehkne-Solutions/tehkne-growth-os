CREATE TYPE "GrowthExperimentStatus" AS ENUM (
  'DRAFT',
  'READY',
  'RUNNING',
  'OBSERVING',
  'CONCLUDED',
  'CANCELLED'
);

CREATE TYPE "GrowthExperimentCategory" AS ENUM (
  'AUDIENCE',
  'OFFER',
  'CREATIVE',
  'COPY',
  'LANDING_PAGE',
  'FORM_FRICTION',
  'BIDDING',
  'CONVERSION_SIGNAL',
  'BUDGET_DISTRIBUTION',
  'CRM_FOLLOW_UP',
  'RETENTION_REACTIVATION',
  'OTHER'
);

CREATE TYPE "GrowthExperimentDesign" AS ENUM (
  'OBSERVATIONAL',
  'BEFORE_AFTER',
  'AB_TEST',
  'HOLDOUT',
  'GEO_EXPERIMENT',
  'OTHER'
);

CREATE TYPE "GrowthExperimentDecision" AS ENUM (
  'SCALE',
  'ITERATE',
  'STOP',
  'MAINTAIN',
  'INCONCLUSIVE',
  'CANCELLED'
);

CREATE TABLE "growth_experiments" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "title" VARCHAR(240) NOT NULL,
  "hypothesis" TEXT NOT NULL,
  "category" "GrowthExperimentCategory" NOT NULL,
  "design" "GrowthExperimentDesign" NOT NULL,
  "target_metric_id" VARCHAR(120) NOT NULL,
  "guardrail_metric_id" VARCHAR(120),
  "baseline_value" DECIMAL(24, 8),
  "baseline_period_start" TIMESTAMPTZ(6),
  "baseline_period_end" TIMESTAMPTZ(6),
  "intervention" TEXT NOT NULL,
  "status" "GrowthExperimentStatus" NOT NULL DEFAULT 'DRAFT',
  "start_at" TIMESTAMPTZ(6),
  "observation_until" TIMESTAMPTZ(6),
  "concluded_at" TIMESTAMPTZ(6),
  "owner_user_id" UUID,
  "result_summary" TEXT,
  "decision" "GrowthExperimentDecision",
  "learning" TEXT,
  "created_by_user_id" UUID NOT NULL,
  "updated_by_user_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "growth_experiments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "growth_experiments_title_check" CHECK (char_length(trim("title")) >= 3),
  CONSTRAINT "growth_experiments_hypothesis_check" CHECK (char_length(trim("hypothesis")) >= 10),
  CONSTRAINT "growth_experiments_intervention_check" CHECK (char_length(trim("intervention")) >= 3),
  CONSTRAINT "growth_experiments_baseline_period_check" CHECK (
    ("baseline_period_start" IS NULL AND "baseline_period_end" IS NULL)
    OR ("baseline_period_start" IS NOT NULL AND "baseline_period_end" IS NOT NULL AND "baseline_period_end" >= "baseline_period_start")
  ),
  CONSTRAINT "growth_experiments_observation_window_check" CHECK (
    "observation_until" IS NULL OR "start_at" IS NULL OR "observation_until" >= "start_at"
  ),
  CONSTRAINT "growth_experiments_conclusion_check" CHECK (
    ("status" = 'CONCLUDED' AND "concluded_at" IS NOT NULL AND "decision" IS NOT NULL AND "result_summary" IS NOT NULL AND "learning" IS NOT NULL)
    OR ("status" <> 'CONCLUDED')
  ),
  CONSTRAINT "growth_experiments_workspace_fk" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "growth_experiments_owner_fk" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "growth_experiments_created_by_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "growth_experiments_updated_by_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "growth_experiments_workspace_status_updated_idx"
  ON "growth_experiments"("workspace_id", "status", "updated_at" DESC);

CREATE INDEX "growth_experiments_owner_status_idx"
  ON "growth_experiments"("owner_user_id", "status", "updated_at" DESC);
