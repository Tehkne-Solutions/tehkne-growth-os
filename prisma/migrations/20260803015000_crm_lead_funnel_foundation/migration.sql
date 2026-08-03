CREATE TABLE growth_crm_connections (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  provider VARCHAR(40) NOT NULL,
  external_account_id VARCHAR(180) NOT NULL,
  display_name VARCHAR(180) NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'ACTIVE',
  secret_ref VARCHAR(255),
  cursor TEXT,
  watermark TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,
  last_attempt_at TIMESTAMPTZ,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT growth_crm_connections_provider_check CHECK (provider IN ('HUBSPOT')),
  CONSTRAINT growth_crm_connections_status_check CHECK (status IN ('ACTIVE','PAUSED','ERROR','DISCONNECTED')),
  UNIQUE (workspace_id, provider, external_account_id)
);

CREATE INDEX growth_crm_connections_workspace_status_idx
  ON growth_crm_connections(workspace_id, status);

CREATE TABLE growth_crm_leads (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  connection_id UUID NOT NULL REFERENCES growth_crm_connections(id) ON DELETE RESTRICT,
  provider VARCHAR(40) NOT NULL,
  external_id VARCHAR(180) NOT NULL,
  identity_hash CHAR(64),
  lifecycle_stage VARCHAR(120),
  created_at_source TIMESTAMPTZ,
  updated_at_source TIMESTAMPTZ,
  properties JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, provider, external_id)
);

CREATE INDEX growth_crm_leads_workspace_stage_idx
  ON growth_crm_leads(workspace_id, lifecycle_stage, updated_at_source);
CREATE INDEX growth_crm_leads_identity_hash_idx
  ON growth_crm_leads(workspace_id, identity_hash)
  WHERE identity_hash IS NOT NULL;

CREATE TABLE growth_crm_opportunities (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  connection_id UUID NOT NULL REFERENCES growth_crm_connections(id) ON DELETE RESTRICT,
  provider VARCHAR(40) NOT NULL,
  external_id VARCHAR(180) NOT NULL,
  primary_lead_id UUID REFERENCES growth_crm_leads(id) ON DELETE SET NULL,
  pipeline_id VARCHAR(180),
  stage_id VARCHAR(180),
  amount NUMERIC(24,8),
  currency CHAR(3),
  status VARCHAR(24) NOT NULL DEFAULT 'OPEN',
  created_at_source TIMESTAMPTZ,
  updated_at_source TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  properties JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT growth_crm_opportunities_status_check CHECK (status IN ('OPEN','WON','LOST')),
  UNIQUE (workspace_id, provider, external_id)
);

CREATE INDEX growth_crm_opportunities_workspace_stage_idx
  ON growth_crm_opportunities(workspace_id, pipeline_id, stage_id, updated_at_source);
CREATE INDEX growth_crm_opportunities_workspace_status_idx
  ON growth_crm_opportunities(workspace_id, status, closed_at);

CREATE TABLE growth_crm_funnel_events (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  connection_id UUID NOT NULL REFERENCES growth_crm_connections(id) ON DELETE RESTRICT,
  subject_type VARCHAR(24) NOT NULL,
  subject_id UUID NOT NULL,
  event_type VARCHAR(80) NOT NULL,
  stage_id VARCHAR(180),
  occurred_at TIMESTAMPTZ NOT NULL,
  deduplication_key CHAR(64) NOT NULL UNIQUE,
  properties JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT growth_crm_funnel_events_subject_check CHECK (subject_type IN ('LEAD','OPPORTUNITY'))
);

CREATE INDEX growth_crm_funnel_events_workspace_time_idx
  ON growth_crm_funnel_events(workspace_id, occurred_at);
CREATE INDEX growth_crm_funnel_events_subject_idx
  ON growth_crm_funnel_events(subject_type, subject_id, occurred_at);

INSERT INTO permissions (id, key, description)
VALUES (gen_random_uuid(), 'growth.crm.manage', 'Manage read-only CRM connections and funnel synchronization.')
ON CONFLICT (key) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT DISTINCT existing_rp.role_id, crm_permission.id
FROM role_permissions existing_rp
JOIN permissions existing_permission ON existing_permission.id = existing_rp.permission_id
CROSS JOIN permissions crm_permission
WHERE existing_permission.key = 'growth.connectors.manage'
  AND crm_permission.key = 'growth.crm.manage'
ON CONFLICT DO NOTHING;
