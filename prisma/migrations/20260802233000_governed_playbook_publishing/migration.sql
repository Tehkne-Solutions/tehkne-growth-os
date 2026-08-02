INSERT INTO permissions (id, key, description)
VALUES (gen_random_uuid(), 'growth.playbooks.publish', 'Validate and explicitly publish workspace-scoped Growth playbook candidates.')
ON CONFLICT (key) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT DISTINCT rp.role_id, publish_permission.id
FROM role_permissions rp
JOIN permissions review_permission ON review_permission.id = rp.permission_id
CROSS JOIN permissions publish_permission
WHERE review_permission.key = 'growth.playbooks.review'
  AND publish_permission.key = 'growth.playbooks.publish'
ON CONFLICT DO NOTHING;

CREATE TABLE growth_playbook_publication_candidates (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  proposal_id UUID NOT NULL UNIQUE REFERENCES growth_playbook_review_proposals(id) ON DELETE RESTRICT,
  sector_pack_id TEXT NOT NULL,
  sector_pack_version TEXT NOT NULL,
  rule_id TEXT NOT NULL,
  base_rule_version TEXT NOT NULL,
  candidate_rule_version TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'VALIDATED', 'PUBLISHED', 'REJECTED')),
  candidate_rule JSONB NOT NULL,
  structured_diff JSONB NOT NULL,
  created_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  validated_by_user_id UUID REFERENCES users(id) ON DELETE RESTRICT,
  published_by_user_id UUID REFERENCES users(id) ON DELETE RESTRICT,
  rejected_by_user_id UUID REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  validated_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,
  CONSTRAINT growth_playbook_candidate_rule_version_unique UNIQUE (workspace_id, sector_pack_id, sector_pack_version, rule_id, candidate_rule_version)
);

CREATE INDEX growth_playbook_candidate_workspace_status_idx
  ON growth_playbook_publication_candidates (workspace_id, status, created_at DESC);
CREATE INDEX growth_playbook_candidate_runtime_idx
  ON growth_playbook_publication_candidates (workspace_id, sector_pack_id, sector_pack_version, status, published_at DESC);
