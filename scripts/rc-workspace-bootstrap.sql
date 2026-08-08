\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
  operator_uuid UUID;
  client_uuid UUID;
  workspace_uuid UUID;
BEGIN
  SELECT id
    INTO operator_uuid
    FROM operator_organizations
   WHERE slug = 'tehkne-solutions';

  IF operator_uuid IS NULL THEN
    operator_uuid := '91000000-0000-4000-8000-000000000001'::uuid;
    INSERT INTO operator_organizations (
      id, slug, name, status, timezone, created_at, updated_at
    ) VALUES (
      operator_uuid,
      'tehkne-solutions',
      'Tehkné Solutions',
      'ACTIVE',
      'America/Sao_Paulo',
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    );
  ELSE
    UPDATE operator_organizations
       SET name = 'Tehkné Solutions',
           status = 'ACTIVE',
           timezone = 'America/Sao_Paulo',
           updated_at = CURRENT_TIMESTAMP
     WHERE id = operator_uuid;
  END IF;

  SELECT id
    INTO client_uuid
    FROM client_organizations
   WHERE operator_organization_id = operator_uuid
     AND slug = 'tkn-growth-rc';

  IF client_uuid IS NULL THEN
    client_uuid := '92000000-0000-4000-8000-000000000001'::uuid;
    INSERT INTO client_organizations (
      id,
      operator_organization_id,
      slug,
      name,
      legal_name,
      status,
      locale,
      currency,
      timezone,
      created_at,
      updated_at
    ) VALUES (
      client_uuid,
      operator_uuid,
      'tkn-growth-rc',
      'TKN Growth RC',
      'Tehkné Solutions',
      'ACTIVE',
      'pt-BR',
      'BRL',
      'America/Sao_Paulo',
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    );
  ELSE
    UPDATE client_organizations
       SET name = 'TKN Growth RC',
           legal_name = 'Tehkné Solutions',
           status = 'ACTIVE',
           locale = 'pt-BR',
           currency = 'BRL',
           timezone = 'America/Sao_Paulo',
           updated_at = CURRENT_TIMESTAMP
     WHERE id = client_uuid;
  END IF;

  SELECT id
    INTO workspace_uuid
    FROM workspaces
   WHERE client_organization_id = client_uuid
     AND slug = 'rc-validation';

  IF workspace_uuid IS NULL THEN
    workspace_uuid := '93000000-0000-4000-8000-000000000001'::uuid;
    INSERT INTO workspaces (
      id,
      operator_organization_id,
      client_organization_id,
      brand_id,
      slug,
      name,
      kind,
      status,
      created_at,
      updated_at
    ) VALUES (
      workspace_uuid,
      operator_uuid,
      client_uuid,
      NULL,
      'rc-validation',
      'RC Validation',
      'GROWTH_OPERATIONS',
      'ACTIVE',
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    );
  ELSE
    UPDATE workspaces
       SET name = 'RC Validation',
           kind = 'GROWTH_OPERATIONS',
           status = 'ACTIVE',
           updated_at = CURRENT_TIMESTAMP
     WHERE id = workspace_uuid;
  END IF;

  INSERT INTO audit_events (
    id,
    operator_organization_id,
    client_organization_id,
    workspace_id,
    actor_user_id,
    action,
    resource_type,
    resource_id,
    request_id,
    metadata,
    occurred_at
  )
  SELECT
    '94000000-0000-4000-8000-000000000001'::uuid,
    operator_uuid,
    client_uuid,
    workspace_uuid,
    NULL,
    'rc.workspace.bootstrap',
    'workspace',
    workspace_uuid::text,
    'int-43-rc-workspace-bootstrap',
    jsonb_build_object(
      'workspaceSlug', 'rc-validation',
      'clientSlug', 'tkn-growth-rc',
      'operatorSlug', 'tehkne-solutions',
      'signature', 'Tehkné Solutions'
    ),
    CURRENT_TIMESTAMP
  WHERE NOT EXISTS (
    SELECT 1
      FROM audit_events
     WHERE action = 'rc.workspace.bootstrap'
       AND resource_type = 'workspace'
       AND resource_id = workspace_uuid::text
  );

  RAISE NOTICE 'RC_WORKSPACE_ID=%', workspace_uuid;
END
$$;

COMMIT;

SELECT w.id::text AS rc_workspace_id
FROM workspaces w
JOIN client_organizations c ON c.id = w.client_organization_id
JOIN operator_organizations o ON o.id = w.operator_organization_id
WHERE o.slug = 'tehkne-solutions'
  AND c.slug = 'tkn-growth-rc'
  AND w.slug = 'rc-validation';
