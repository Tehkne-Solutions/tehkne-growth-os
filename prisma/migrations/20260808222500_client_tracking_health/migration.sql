CREATE TYPE "ClientTrackingHealthStatus" AS ENUM (
  'UNKNOWN',
  'PENDING',
  'HEALTHY',
  'DEGRADED',
  'BROKEN',
  'NOT_APPLICABLE'
);

CREATE TABLE "growth_client_tracking_health_items" (
  "workspace_id" UUID NOT NULL,
  "item_key" VARCHAR(80) NOT NULL,
  "status" "ClientTrackingHealthStatus" NOT NULL DEFAULT 'UNKNOWN',
  "evidence_reference" VARCHAR(240),
  "assessed_by_user_id" UUID NOT NULL,
  "assessed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "growth_client_tracking_health_items_pkey" PRIMARY KEY ("workspace_id", "item_key"),
  CONSTRAINT "growth_client_tracking_health_items_key_check" CHECK ("item_key" IN (
    'GA4_COLLECTION',
    'GTM_CONTAINER',
    'GOOGLE_ADS_CONVERSION',
    'META_PIXEL_DATASET',
    'CAPI_SERVER_SIDE',
    'EVENT_DEDUPLICATION',
    'ENHANCED_CONVERSIONS',
    'CONSENT_PRIVACY',
    'END_TO_END_SMOKE'
  )),
  CONSTRAINT "growth_client_tracking_health_items_workspace_fk" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "growth_client_tracking_health_items_assessed_by_fk" FOREIGN KEY ("assessed_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "growth_client_tracking_health_items_workspace_status_idx"
  ON "growth_client_tracking_health_items"("workspace_id", "status", "updated_at" DESC);
