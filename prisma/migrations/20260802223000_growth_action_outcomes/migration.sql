CREATE TABLE growth_action_outcomes (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  action_item_id UUID NOT NULL REFERENCES growth_action_items(id) ON DELETE CASCADE,
  metric_id TEXT NOT NULL,
  currency TEXT,
  baseline_from TIMESTAMPTZ NOT NULL,
  baseline_to TIMESTAMPTZ NOT NULL,
  evaluation_from TIMESTAMPTZ NOT NULL,
  evaluation_to TIMESTAMPTZ NOT NULL,
  baseline_value DOUBLE PRECISION NOT NULL,
  evaluation_value DOUBLE PRECISION NOT NULL,
  absolute_delta DOUBLE PRECISION NOT NULL,
  percentage_delta DOUBLE PRECISION,
  outcome TEXT NOT NULL CHECK (outcome IN ('IMPROVED', 'WORSENED', 'NEUTRAL', 'CONTEXT_REQUIRED', 'INSUFFICIENT_DATA')),
  recorded_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT growth_action_outcomes_window_order CHECK (baseline_to >= baseline_from AND evaluation_to >= evaluation_from),
  CONSTRAINT growth_action_outcomes_unique_metric UNIQUE (action_item_id, metric_id, currency)
);

CREATE INDEX growth_action_outcomes_workspace_recorded_idx
  ON growth_action_outcomes (workspace_id, recorded_at DESC);

CREATE INDEX growth_action_outcomes_rule_effectiveness_idx
  ON growth_action_outcomes (workspace_id, outcome, recorded_at DESC);
