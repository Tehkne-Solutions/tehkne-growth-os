CREATE TABLE "metric_goals" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "sector_pack_id" VARCHAR(80) NOT NULL,
  "sector_pack_version" VARCHAR(32) NOT NULL,
  "metric_id" VARCHAR(120) NOT NULL,
  "currency" CHAR(3),
  "target_value" DECIMAL(24, 8) NOT NULL,
  "valid_from" TIMESTAMPTZ(6) NOT NULL,
  "valid_to" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "metric_goals_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "metric_goals_period_check" CHECK (
    "valid_to" IS NULL OR "valid_to" >= "valid_from"
  )
);

ALTER TABLE "metric_goals"
  ADD CONSTRAINT "metric_goals_workspace_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "metric_goals_effective_key"
  ON "metric_goals"("workspace_id", "sector_pack_id", "sector_pack_version", "metric_id", COALESCE("currency", ''), "valid_from");

CREATE INDEX "metric_goals_workspace_period_idx"
  ON "metric_goals"("workspace_id", "valid_from", "valid_to");

CREATE INDEX "metric_goals_workspace_metric_idx"
  ON "metric_goals"("workspace_id", "metric_id", "valid_from");
