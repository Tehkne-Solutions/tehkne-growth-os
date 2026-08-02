ALTER TABLE growth_connector_oauth_attempts
  ADD COLUMN token_secret_ref varchar(240),
  ADD COLUMN completed_at timestamptz;

CREATE INDEX growth_connector_oauth_attempts_workspace_completed_idx
  ON growth_connector_oauth_attempts (workspace_id, completed_at DESC);
