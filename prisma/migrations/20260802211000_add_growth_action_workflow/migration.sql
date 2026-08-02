CREATE TABLE "growth_action_items" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "sector_pack_id" VARCHAR(80) NOT NULL,
  "sector_pack_version" VARCHAR(32) NOT NULL,
  "rule_id" VARCHAR(120) NOT NULL,
  "rule_version" VARCHAR(32) NOT NULL,
  "action_id" VARCHAR(120) NOT NULL,
  "recommendation_key" VARCHAR(260) NOT NULL,
  "title" VARCHAR(240) NOT NULL,
  "rationale" TEXT NOT NULL,
  "priority" INTEGER NOT NULL,
  "status" VARCHAR(24) NOT NULL DEFAULT 'OPEN',
  "responsible_user_id" UUID,
  "created_by_user_id" UUID NOT NULL,
  "accepted_at" TIMESTAMPTZ(6),
  "started_at" TIMESTAMPTZ(6),
  "completed_at" TIMESTAMPTZ(6),
  "rejected_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "growth_action_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "growth_action_items_status_check" CHECK ("status" IN ('OPEN','ACCEPTED','IN_PROGRESS','COMPLETED','REJECTED')),
  CONSTRAINT "growth_action_items_priority_check" CHECK ("priority" >= 0),
  CONSTRAINT "growth_action_items_workspace_fk" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "growth_action_items_responsible_fk" FOREIGN KEY ("responsible_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "growth_action_items_created_by_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "growth_action_items_workspace_recommendation_key" ON "growth_action_items"("workspace_id", "recommendation_key");
CREATE INDEX "growth_action_items_workspace_status_priority" ON "growth_action_items"("workspace_id", "status", "priority" DESC, "created_at" DESC);
CREATE INDEX "growth_action_items_responsible_status" ON "growth_action_items"("responsible_user_id", "status", "updated_at" DESC);

INSERT INTO "permissions" ("id", "key", "description")
VALUES (gen_random_uuid(), 'growth.actions.manage', 'Create, assign and transition human Growth action items derived from declarative playbooks.')
ON CONFLICT ("key") DO NOTHING;
