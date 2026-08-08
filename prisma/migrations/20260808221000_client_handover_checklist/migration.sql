CREATE TYPE "ClientHandoverItemStatus" AS ENUM (
  'PENDING',
  'IN_PROGRESS',
  'VERIFIED',
  'BLOCKED',
  'NOT_APPLICABLE'
);

CREATE TABLE "growth_client_handover_items" (
  "workspace_id" UUID NOT NULL,
  "item_key" VARCHAR(80) NOT NULL,
  "status" "ClientHandoverItemStatus" NOT NULL DEFAULT 'PENDING',
  "external_reference" VARCHAR(240),
  "verified_by_user_id" UUID,
  "verified_at" TIMESTAMPTZ(6),
  "updated_by_user_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "growth_client_handover_items_pkey" PRIMARY KEY ("workspace_id", "item_key"),
  CONSTRAINT "growth_client_handover_items_key_check" CHECK ("item_key" IN (
    'GOOGLE_ADS_MCC',
    'META_PARTNER_ACCESS',
    'GA4',
    'GTM',
    'WEBSITE_CMS',
    'LANDING_PAGES',
    'HUBSPOT_CRM',
    'META_PIXEL_DATASET',
    'CONVERSIONS_API',
    'DOMAIN_OWNERSHIP',
    'BILLING_OWNER',
    'TRACKING_SMOKE',
    'HANDOVER_CUTOVER'
  )),
  CONSTRAINT "growth_client_handover_items_verified_check" CHECK (
    ("status" = 'VERIFIED' AND "verified_by_user_id" IS NOT NULL AND "verified_at" IS NOT NULL)
    OR ("status" <> 'VERIFIED' AND "verified_by_user_id" IS NULL AND "verified_at" IS NULL)
  ),
  CONSTRAINT "growth_client_handover_items_workspace_fk" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "growth_client_handover_items_verified_by_fk" FOREIGN KEY ("verified_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "growth_client_handover_items_updated_by_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "growth_client_handover_items_workspace_status_idx"
  ON "growth_client_handover_items"("workspace_id", "status", "updated_at" DESC);
