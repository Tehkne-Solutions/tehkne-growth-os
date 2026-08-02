INSERT INTO permissions (id, key, description)
VALUES (gen_random_uuid(), 'growth.playbooks.review', 'Create, submit, approve or reject governed Growth playbook review proposals.')
ON CONFLICT (key) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT DISTINCT rp.role_id, review_permission.id
FROM role_permissions rp
JOIN permissions action_permission ON action_permission.id = rp.permission_id
CROSS JOIN permissions review_permission
WHERE action_permission.key = 'growth.actions.manage'
  AND review_permission.key = 'growth.playbooks.review'
ON CONFLICT DO NOTHING;

CREATE TABLE growth_playbook_review_proposals (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  sector_pack_id TEXT NOT NULL,
  sector_pack_version TEXT NOT NULL,
  rule_id TEXT NOT NULL,
  rule_version TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED')),
  title TEXT NOT NULL,
  rationale TEXT NOT NULL,
  proposed_change JSONB NOT NULL,
  evidence_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  reviewed_by_user_id UUID REFERENCES users(id) ON DELETE RESTRICT,
  submitted_at TIMESTAMPTZ,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX growth_playbook_review_workspace_status_idx
  ON growth_playbook_review_proposals (workspace_id, status, created_at DESC);
CREATE INDEX growth_playbook_review_rule_idx
  ON growth_playbook_review_proposals (workspace_id, rule_id, rule_version, created_at DESC);
