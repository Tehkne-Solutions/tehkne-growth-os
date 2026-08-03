CREATE TABLE growth_attribution_links (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  subject_type VARCHAR(24) NOT NULL,
  subject_id UUID NOT NULL,
  provider VARCHAR(40) NOT NULL,
  external_account_id VARCHAR(180),
  campaign_id VARCHAR(180),
  evidence_type VARCHAR(40) NOT NULL,
  evidence_hash CHAR(64) NOT NULL,
  confidence VARCHAR(16) NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'OBSERVED',
  observed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT growth_attribution_links_subject_check CHECK (subject_type IN ('LEAD','OPPORTUNITY')),
  CONSTRAINT growth_attribution_links_evidence_check CHECK (evidence_type IN ('CLICK_ID','EXPLICIT_CAMPAIGN_ID','UTM_CAMPAIGN_ID','MANUAL_CONFIRMED')),
  CONSTRAINT growth_attribution_links_confidence_check CHECK (confidence IN ('HIGH','MEDIUM')),
  CONSTRAINT growth_attribution_links_status_check CHECK (status IN ('OBSERVED','CONFIRMED','REJECTED')),
  UNIQUE (workspace_id, subject_type, subject_id, evidence_type, evidence_hash)
);

CREATE INDEX growth_attribution_links_workspace_subject_idx
  ON growth_attribution_links(workspace_id, subject_type, subject_id, status);
CREATE INDEX growth_attribution_links_workspace_campaign_idx
  ON growth_attribution_links(workspace_id, provider, campaign_id, confidence, status)
  WHERE campaign_id IS NOT NULL;
