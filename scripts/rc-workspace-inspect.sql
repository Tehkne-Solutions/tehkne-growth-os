\set ON_ERROR_STOP on

\echo 'RC_WORKSPACE_INSPECTION_BEGIN'

SELECT
  'operator' AS entity,
  id::text AS id,
  slug,
  name,
  status::text AS status
FROM operator_organizations
WHERE slug = 'tehkne-solutions';

SELECT
  'client' AS entity,
  c.id::text AS id,
  c.slug,
  c.name,
  c.status::text AS status
FROM client_organizations c
JOIN operator_organizations o ON o.id = c.operator_organization_id
WHERE o.slug = 'tehkne-solutions'
  AND c.slug = 'tkn-growth-rc';

SELECT
  'workspace' AS entity,
  w.id::text AS id,
  w.slug,
  w.name,
  w.status::text AS status
FROM workspaces w
JOIN client_organizations c ON c.id = w.client_organization_id
JOIN operator_organizations o ON o.id = w.operator_organization_id
WHERE o.slug = 'tehkne-solutions'
  AND c.slug = 'tkn-growth-rc'
  AND w.slug = 'rc-validation';

SELECT
  'workspace_count' AS check_name,
  COUNT(*)::text AS value
FROM workspaces w
JOIN client_organizations c ON c.id = w.client_organization_id
JOIN operator_organizations o ON o.id = w.operator_organization_id
WHERE o.slug = 'tehkne-solutions'
  AND c.slug = 'tkn-growth-rc'
  AND w.slug = 'rc-validation';

\echo 'RC_WORKSPACE_INSPECTION_END'
