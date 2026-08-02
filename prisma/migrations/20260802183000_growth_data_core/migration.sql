CREATE TYPE "MetricImportStatus" AS ENUM ('PREVIEWED', 'COMMITTED', 'REJECTED');

CREATE TABLE "growth_events" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "sector_pack_id" VARCHAR(80) NOT NULL,
  "sector_pack_version" VARCHAR(32) NOT NULL,
  "event_type" VARCHAR(120) NOT NULL,
  "occurred_at" TIMESTAMPTZ(6) NOT NULL,
  "source" VARCHAR(80) NOT NULL,
  "external_id" VARCHAR(180),
  "deduplication_key" CHAR(64) NOT NULL,
  "properties" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "growth_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "metric_import_batches" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "fingerprint" CHAR(64) NOT NULL,
  "sector_pack_id" VARCHAR(80) NOT NULL,
  "sector_pack_version" VARCHAR(32) NOT NULL,
  "source" VARCHAR(80) NOT NULL DEFAULT 'csv',
  "file_name" VARCHAR(255),
  "status" "MetricImportStatus" NOT NULL DEFAULT 'PREVIEWED',
  "accepted_count" INTEGER NOT NULL DEFAULT 0,
  "rejected_count" INTEGER NOT NULL DEFAULT 0,
  "committed_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "metric_import_batches_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "metric_import_batches_counts_check" CHECK ("accepted_count" >= 0 AND "rejected_count" >= 0),
  CONSTRAINT "metric_import_batches_commit_check" CHECK (
    ("status" = 'COMMITTED' AND "committed_at" IS NOT NULL)
    OR ("status" <> 'COMMITTED')
  )
);

CREATE TABLE "metric_observations" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "import_batch_id" UUID,
  "metric_id" VARCHAR(120) NOT NULL,
  "period_start" TIMESTAMPTZ(6) NOT NULL,
  "period_end" TIMESTAMPTZ(6) NOT NULL,
  "value" DECIMAL(24,8) NOT NULL,
  "currency" CHAR(3),
  "source" VARCHAR(80) NOT NULL,
  "dimensions" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "metric_observations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "metric_observations_period_check" CHECK ("period_end" >= "period_start")
);

CREATE TABLE "metric_import_rejections" (
  "id" UUID NOT NULL,
  "batch_id" UUID NOT NULL,
  "row_number" INTEGER NOT NULL,
  "reason" VARCHAR(500) NOT NULL,
  "raw" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "metric_import_rejections_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "metric_import_rejections_row_check" CHECK ("row_number" > 0)
);

CREATE UNIQUE INDEX "growth_events_deduplication_key_key" ON "growth_events"("deduplication_key");
CREATE INDEX "growth_events_workspace_event_occurred_idx" ON "growth_events"("workspace_id", "event_type", "occurred_at");
CREATE INDEX "growth_events_workspace_source_occurred_idx" ON "growth_events"("workspace_id", "source", "occurred_at");
CREATE UNIQUE INDEX "metric_import_batches_workspace_fingerprint_key" ON "metric_import_batches"("workspace_id", "fingerprint");
CREATE INDEX "metric_import_batches_workspace_created_idx" ON "metric_import_batches"("workspace_id", "created_at");
CREATE INDEX "metric_import_batches_workspace_status_created_idx" ON "metric_import_batches"("workspace_id", "status", "created_at");
CREATE INDEX "metric_observations_workspace_metric_period_idx" ON "metric_observations"("workspace_id", "metric_id", "period_start", "period_end");
CREATE INDEX "metric_observations_workspace_source_period_idx" ON "metric_observations"("workspace_id", "source", "period_start");
CREATE INDEX "metric_observations_import_batch_idx" ON "metric_observations"("import_batch_id");
CREATE INDEX "metric_import_rejections_batch_row_idx" ON "metric_import_rejections"("batch_id", "row_number");

ALTER TABLE "growth_events"
  ADD CONSTRAINT "growth_events_workspace_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "metric_import_batches"
  ADD CONSTRAINT "metric_import_batches_workspace_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "metric_observations"
  ADD CONSTRAINT "metric_observations_workspace_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "metric_observations_import_batch_fkey" FOREIGN KEY ("import_batch_id") REFERENCES "metric_import_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "metric_import_rejections"
  ADD CONSTRAINT "metric_import_rejections_batch_fkey" FOREIGN KEY ("batch_id") REFERENCES "metric_import_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
