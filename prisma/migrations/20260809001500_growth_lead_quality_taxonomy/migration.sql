CREATE TYPE "GrowthLeadQualityClass" AS ENUM (
  'UNREVIEWED',
  'INVALID',
  'UNQUALIFIED',
  'QUALIFIED',
  'HIGH_QUALITY',
  'CONVERTED'
);

CREATE TYPE "GrowthLeadQualityReason" AS ENUM (
  'SPAM',
  'DUPLICATE',
  'OUTSIDE_GEO',
  'OUTSIDE_PROFILE',
  'NO_INTENT',
  'LOW_INTENT',
  'VALID_FIT',
  'HIGH_INTENT',
  'SALES_ACCEPTED',
  'PURCHASED',
  'OTHER'
);

CREATE TYPE "GrowthLeadSourceChannel" AS ENUM (
  'GOOGLE_ADS',
  'META_ADS',
  'HUBSPOT',
  'ORGANIC',
  'DIRECT',
  'REFERRAL',
  'OTHER'
);

CREATE TABLE "growth_lead_quality_observations" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "lead_reference" VARCHAR(120) NOT NULL,
  "source_channel" "GrowthLeadSourceChannel" NOT NULL,
  "campaign_reference" VARCHAR(160),
  "quality_class" "GrowthLeadQualityClass" NOT NULL,
  "reason_code" "GrowthLeadQualityReason",
  "observed_at" TIMESTAMPTZ(6) NOT NULL,
  "evidence_reference" VARCHAR(240),
  "created_by_user_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "growth_lead_quality_observations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "growth_lead_quality_observations_lead_ref_check" CHECK ("lead_reference" ~ '^[A-Za-z0-9:_-]{1,120}$'),
  CONSTRAINT "growth_lead_quality_observations_campaign_ref_check" CHECK ("campaign_reference" IS NULL OR "campaign_reference" ~ '^[A-Za-z0-9:_-]{1,160}$'),
  CONSTRAINT "growth_lead_quality_observations_workspace_fk" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "growth_lead_quality_observations_created_by_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "growth_lead_quality_observations_workspace_lead_idx"
  ON "growth_lead_quality_observations"("workspace_id", "lead_reference", "observed_at" DESC, "created_at" DESC);

CREATE INDEX "growth_lead_quality_observations_workspace_quality_idx"
  ON "growth_lead_quality_observations"("workspace_id", "quality_class", "observed_at" DESC);

CREATE INDEX "growth_lead_quality_observations_workspace_source_idx"
  ON "growth_lead_quality_observations"("workspace_id", "source_channel", "campaign_reference", "observed_at" DESC);
