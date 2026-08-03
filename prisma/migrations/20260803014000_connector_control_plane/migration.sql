CREATE TABLE growth_connector_scheduler_locks (
  lock_key TEXT PRIMARY KEY,
  owner_token TEXT NOT NULL,
  acquired_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE growth_connector_scheduler_runs (
  id UUID PRIMARY KEY,
  trigger_source TEXT NOT NULL CHECK (trigger_source IN ('VERCEL_CRON', 'GITHUB_ACTIONS', 'MANUAL_INTERNAL')),
  status TEXT NOT NULL CHECK (status IN ('RUNNING', 'SUCCEEDED', 'PARTIAL', 'FAILED', 'SKIPPED_LOCKED', 'BUDGET_EXHAUSTED')),
  started_at TIMESTAMPTZ NOT NULL,
  finished_at TIMESTAMPTZ,
  budget_ms INTEGER NOT NULL CHECK (budget_ms > 0),
  connections_selected INTEGER NOT NULL DEFAULT 0,
  connections_succeeded INTEGER NOT NULL DEFAULT 0,
  connections_failed INTEGER NOT NULL DEFAULT 0,
  alert_count INTEGER NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX growth_connector_scheduler_runs_started_at_idx
  ON growth_connector_scheduler_runs(started_at DESC);
