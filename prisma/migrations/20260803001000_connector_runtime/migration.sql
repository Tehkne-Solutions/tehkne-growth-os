CREATE TABLE growth_connector_connections (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  provider varchar(40) NOT NULL,
  external_account_id varchar(160) NOT NULL,
  display_name varchar(240) NOT NULL,
  status varchar(24) NOT NULL DEFAULT 'ACTIVE',
  secret_ref varchar(240),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT growth_connector_provider_check CHECK (provider IN ('META_ADS','GOOGLE_ADS')),
  CONSTRAINT growth_connector_status_check CHECK (status IN ('ACTIVE','PAUSED','ERROR','DISCONNECTED')),
  CONSTRAINT growth_connector_workspace_provider_account_key UNIQUE (workspace_id, provider, external_account_id)
);

CREATE INDEX growth_connector_connections_workspace_status_idx
  ON growth_connector_connections (workspace_id, status, provider);

CREATE TABLE growth_connector_checkpoints (
  connection_id uuid PRIMARY KEY REFERENCES growth_connector_connections(id) ON DELETE CASCADE,
  cursor varchar(500),
  watermark timestamptz,
  last_success_at timestamptz,
  last_attempt_at timestamptz,
  consecutive_failures integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT growth_connector_checkpoint_failures_check CHECK (consecutive_failures >= 0)
);

CREATE TABLE growth_connector_sync_runs (
  id uuid PRIMARY KEY,
  connection_id uuid NOT NULL REFERENCES growth_connector_connections(id) ON DELETE RESTRICT,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  provider varchar(40) NOT NULL,
  status varchar(24) NOT NULL DEFAULT 'RUNNING',
  cursor_before varchar(500),
  cursor_after varchar(500),
  watermark_before timestamptz,
  watermark_after timestamptz,
  records_read integer NOT NULL DEFAULT 0,
  records_written integer NOT NULL DEFAULT 0,
  records_deduplicated integer NOT NULL DEFAULT 0,
  error_code varchar(120),
  error_message varchar(1000),
  started_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at timestamptz,
  CONSTRAINT growth_connector_run_provider_check CHECK (provider IN ('META_ADS','GOOGLE_ADS')),
  CONSTRAINT growth_connector_run_status_check CHECK (status IN ('RUNNING','SUCCEEDED','FAILED','PARTIAL')),
  CONSTRAINT growth_connector_run_counts_check CHECK (records_read >= 0 AND records_written >= 0 AND records_deduplicated >= 0)
);

CREATE INDEX growth_connector_sync_runs_workspace_started_idx
  ON growth_connector_sync_runs (workspace_id, started_at DESC);
CREATE INDEX growth_connector_sync_runs_connection_started_idx
  ON growth_connector_sync_runs (connection_id, started_at DESC);

INSERT INTO permissions (id, key, description)
VALUES (gen_random_uuid(), 'growth.connectors.manage', 'Configure and operate read-only Growth data connectors.')
ON CONFLICT (key) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT DISTINCT rp.role_id, p_connector.id
FROM role_permissions rp
JOIN permissions p_existing ON p_existing.id = rp.permission_id
JOIN permissions p_connector ON p_connector.key = 'growth.connectors.manage'
WHERE p_existing.key = 'growth.actions.manage'
ON CONFLICT DO NOTHING;
