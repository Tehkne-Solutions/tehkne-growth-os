INSERT INTO permissions (id, key, description)
VALUES (gen_random_uuid(), 'growth.attribution.review', 'Confirm or reject workspace-scoped growth attribution links.')
ON CONFLICT (key) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT DISTINCT rp.role_id, attribution_permission.id
FROM role_permissions rp
JOIN permissions source_permission ON source_permission.id = rp.permission_id
JOIN permissions attribution_permission ON attribution_permission.key = 'growth.attribution.review'
WHERE source_permission.key = 'growth.crm.manage'
ON CONFLICT DO NOTHING;
