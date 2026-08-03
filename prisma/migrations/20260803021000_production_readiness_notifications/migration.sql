CREATE TABLE growth_operations_notification_deliveries (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  fingerprint CHAR(64) NOT NULL,
  channel VARCHAR(24) NOT NULL,
  severity VARCHAR(16) NOT NULL,
  reason VARCHAR(80) NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'PENDING',
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT growth_operations_notification_channel_check CHECK (channel IN ('WEBHOOK')),
  CONSTRAINT growth_operations_notification_severity_check CHECK (severity IN ('critical','warning')),
  CONSTRAINT growth_operations_notification_status_check CHECK (status IN ('PENDING','SENT','FAILED')),
  UNIQUE (workspace_id, fingerprint, channel)
);

CREATE INDEX growth_operations_notification_deliveries_workspace_created_idx
  ON growth_operations_notification_deliveries(workspace_id, created_at DESC);

CREATE INDEX growth_operations_notification_deliveries_status_idx
  ON growth_operations_notification_deliveries(status, created_at DESC);
