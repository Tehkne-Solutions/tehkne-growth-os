\set ON_ERROR_STOP on
\pset tuples_only on
\pset format unaligned

SELECT w.id::text
FROM workspaces w
JOIN client_organizations c ON c.id = w.client_organization_id
JOIN operator_organizations o ON o.id = w.operator_organization_id
WHERE o.slug = 'tehkne-solutions'
  AND c.slug = 'tkn-growth-rc'
  AND w.slug = 'rc-validation'
  AND w.status = 'ACTIVE'
LIMIT 1;
