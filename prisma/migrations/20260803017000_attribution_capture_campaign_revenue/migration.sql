CREATE TABLE growth_attribution_campaign_metrics (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  provider VARCHAR(40) NOT NULL,
  external_account_id VARCHAR(180),
  campaign_id VARCHAR(180) NOT NULL,
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  currency CHAR(3),
  attributed_leads INTEGER NOT NULL DEFAULT 0,
  attributed_won_deals INTEGER NOT NULL DEFAULT 0,
  attributed_revenue NUMERIC(24,8) NOT NULL DEFAULT 0,
  media_spend NUMERIC(24,8),
  attributed_roas NUMERIC(24,8),
  confidence_high_count INTEGER NOT NULL DEFAULT 0,
  confidence_medium_count INTEGER NOT NULL DEFAULT 0,
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT growth_attribution_campaign_metrics_period_check CHECK (period_end >= period_start),
  UNIQUE (workspace_id, provider, external_account_id, campaign_id, period_start, period_end, currency)
);

CREATE INDEX growth_attribution_campaign_metrics_workspace_period_idx
  ON growth_attribution_campaign_metrics(workspace_id, period_start, period_end);
CREATE INDEX growth_attribution_campaign_metrics_campaign_idx
  ON growth_attribution_campaign_metrics(workspace_id, provider, campaign_id, calculated_at);
