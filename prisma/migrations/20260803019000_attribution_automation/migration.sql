ALTER TABLE growth_attribution_campaign_metrics
  ADD COLUMN IF NOT EXISTS status_observed_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS status_confirmed_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS status_rejected_count INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS growth_attribution_links_workspace_status_campaign_idx
  ON growth_attribution_links(workspace_id, status, provider, campaign_id)
  WHERE campaign_id IS NOT NULL;
