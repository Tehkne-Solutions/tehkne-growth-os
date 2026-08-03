ALTER TABLE growth_connector_oauth_attempts
  ADD COLUMN IF NOT EXISTS return_to TEXT;

ALTER TABLE growth_crm_connections
  ADD COLUMN IF NOT EXISTS settings JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS growth_crm_connections_workspace_provider_status_idx
  ON growth_crm_connections(workspace_id, provider, status);
