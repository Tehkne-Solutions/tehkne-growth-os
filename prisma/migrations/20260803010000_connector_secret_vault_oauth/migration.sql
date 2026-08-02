CREATE TABLE app_secret_vault (
  secret_ref varchar(240) PRIMARY KEY,
  ciphertext bytea NOT NULL,
  iv bytea NOT NULL,
  auth_tag bytea NOT NULL,
  key_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT app_secret_vault_key_version_check CHECK (key_version > 0)
);

CREATE TABLE growth_connector_oauth_attempts (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  provider varchar(40) NOT NULL,
  state_hash char(64) NOT NULL UNIQUE,
  pkce_secret_ref varchar(240) NOT NULL,
  redirect_uri varchar(1000) NOT NULL,
  created_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT growth_connector_oauth_provider_check CHECK (provider IN ('META_ADS','GOOGLE_ADS')),
  CONSTRAINT growth_connector_oauth_expiry_check CHECK (expires_at > created_at)
);

CREATE INDEX growth_connector_oauth_workspace_created_idx
  ON growth_connector_oauth_attempts (workspace_id, created_at DESC);
CREATE INDEX growth_connector_oauth_expiry_idx
  ON growth_connector_oauth_attempts (expires_at)
  WHERE consumed_at IS NULL;
