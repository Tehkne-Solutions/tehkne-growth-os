CREATE TYPE "GrowthBudgetPlanStatus" AS ENUM (
  'ACTIVE',
  'ARCHIVED'
);

CREATE TYPE "GrowthBudgetPacingStatus" AS ENUM (
  'NOT_STARTED',
  'ON_TRACK',
  'WATCH_UNDER',
  'WATCH_OVER',
  'CRITICAL_UNDER',
  'CRITICAL_OVER',
  'COMPLETE'
);

CREATE TYPE "GrowthPerformanceAnomalyDirection" AS ENUM (
  'BELOW',
  'UNCHANGED',
  'ABOVE'
);

CREATE TYPE "GrowthPerformanceAnomalySeverity" AS ENUM (
  'UNCLASSIFIED',
  'WATCH',
  'HIGH',
  'CRITICAL'
);

CREATE TABLE "growth_budget_pacing_plans" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "label" VARCHAR(240) NOT NULL,
  "period_start" TIMESTAMPTZ(6) NOT NULL,
  "period_end" TIMESTAMPTZ(6) NOT NULL,
  "budget_amount" DECIMAL(24, 8) NOT NULL,
  "financial_currency" CHAR(3) NOT NULL DEFAULT 'BRL',
  "warning_deviation_pct" DECIMAL(8, 4) NOT NULL DEFAULT 10,
  "critical_deviation_pct" DECIMAL(8, 4) NOT NULL DEFAULT 25,
  "status" "GrowthBudgetPlanStatus" NOT NULL DEFAULT 'ACTIVE',
  "created_by_user_id" UUID NOT NULL,
  "updated_by_user_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "growth_budget_pacing_plans_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "growth_budget_pacing_plans_label_check" CHECK (char_length(trim("label")) >= 3),
  CONSTRAINT "growth_budget_pacing_plans_period_check" CHECK ("period_end" > "period_start"),
  CONSTRAINT "growth_budget_pacing_plans_budget_check" CHECK ("budget_amount" > 0),
  CONSTRAINT "growth_budget_pacing_plans_currency_check" CHECK ("financial_currency" ~ '^[A-Z]{3}$'),
  CONSTRAINT "growth_budget_pacing_plans_warning_check" CHECK ("warning_deviation_pct" > 0),
  CONSTRAINT "growth_budget_pacing_plans_critical_check" CHECK ("critical_deviation_pct" >= "warning_deviation_pct"),
  CONSTRAINT "growth_budget_pacing_plans_workspace_fk" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "growth_budget_pacing_plans_created_by_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "growth_budget_pacing_plans_updated_by_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "growth_budget_pacing_observations" (
  "id" UUID NOT NULL,
  "plan_id" UUID NOT NULL,
  "observed_at" TIMESTAMPTZ(6) NOT NULL,
  "actual_spend" DECIMAL(24, 8) NOT NULL,
  "elapsed_ratio" DECIMAL(12, 8) NOT NULL,
  "expected_spend" DECIMAL(24, 8) NOT NULL,
  "projected_spend" DECIMAL(24, 8),
  "deviation_pct" DECIMAL(12, 6) NOT NULL,
  "status" "GrowthBudgetPacingStatus" NOT NULL,
  "source_reference" VARCHAR(240),
  "created_by_user_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "growth_budget_pacing_observations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "growth_budget_pacing_observations_actual_check" CHECK ("actual_spend" >= 0),
  CONSTRAINT "growth_budget_pacing_observations_elapsed_check" CHECK ("elapsed_ratio" >= 0 AND "elapsed_ratio" <= 1),
  CONSTRAINT "growth_budget_pacing_observations_expected_check" CHECK ("expected_spend" >= 0),
  CONSTRAINT "growth_budget_pacing_observations_projected_check" CHECK ("projected_spend" IS NULL OR "projected_spend" >= 0),
  CONSTRAINT "growth_budget_pacing_observations_plan_fk" FOREIGN KEY ("plan_id") REFERENCES "growth_budget_pacing_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "growth_budget_pacing_observations_created_by_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "growth_performance_anomalies" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "metric_id" VARCHAR(120) NOT NULL,
  "observed_at" TIMESTAMPTZ(6) NOT NULL,
  "observed_value" DECIMAL(24, 8) NOT NULL,
  "baseline_value" DECIMAL(24, 8) NOT NULL,
  "absolute_delta" DECIMAL(24, 8) NOT NULL,
  "deviation_pct" DECIMAL(12, 6),
  "direction" "GrowthPerformanceAnomalyDirection" NOT NULL,
  "severity" "GrowthPerformanceAnomalySeverity" NOT NULL,
  "watch_threshold_pct" DECIMAL(8, 4) NOT NULL,
  "high_threshold_pct" DECIMAL(8, 4) NOT NULL,
  "critical_threshold_pct" DECIMAL(8, 4) NOT NULL,
  "evidence_reference" VARCHAR(240),
  "acknowledged_at" TIMESTAMPTZ(6),
  "acknowledged_by_user_id" UUID,
  "created_by_user_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "growth_performance_anomalies_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "growth_performance_anomalies_metric_check" CHECK (char_length(trim("metric_id")) >= 1),
  CONSTRAINT "growth_performance_anomalies_threshold_check" CHECK (
    "watch_threshold_pct" > 0
    AND "high_threshold_pct" >= "watch_threshold_pct"
    AND "critical_threshold_pct" >= "high_threshold_pct"
  ),
  CONSTRAINT "growth_performance_anomalies_ack_check" CHECK (
    ("acknowledged_at" IS NULL AND "acknowledged_by_user_id" IS NULL)
    OR ("acknowledged_at" IS NOT NULL AND "acknowledged_by_user_id" IS NOT NULL)
  ),
  CONSTRAINT "growth_performance_anomalies_workspace_fk" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "growth_performance_anomalies_ack_by_fk" FOREIGN KEY ("acknowledged_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "growth_performance_anomalies_created_by_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "growth_budget_pacing_plans_workspace_status_idx"
  ON "growth_budget_pacing_plans"("workspace_id", "status", "period_end" DESC);

CREATE INDEX "growth_budget_pacing_observations_plan_observed_idx"
  ON "growth_budget_pacing_observations"("plan_id", "observed_at" DESC);

CREATE INDEX "growth_performance_anomalies_workspace_severity_idx"
  ON "growth_performance_anomalies"("workspace_id", "severity", "observed_at" DESC);

CREATE INDEX "growth_performance_anomalies_workspace_metric_idx"
  ON "growth_performance_anomalies"("workspace_id", "metric_id", "observed_at" DESC);
