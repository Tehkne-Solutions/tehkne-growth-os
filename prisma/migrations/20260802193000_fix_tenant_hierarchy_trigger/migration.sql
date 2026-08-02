-- Fix the shared tenant hierarchy trigger so it can execute against tables
-- whose rowtypes do not expose every optional tenant field (for example,
-- workspaces has no workspace_id and audit_events has no brand_id).
--
-- Access optional fields through to_jsonb(NEW) rather than direct NEW.field
-- dereferences. This preserves one central validation function without making
-- PostgreSQL resolve non-existent record attributes.
CREATE OR REPLACE FUNCTION "assert_tenant_hierarchy"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  row_data JSONB := to_jsonb(NEW);
  current_operator_id UUID;
  current_client_id UUID;
  current_brand_id UUID;
  current_workspace_id UUID;
  current_role_id UUID;
  resolved_operator_id UUID;
  resolved_client_id UUID;
  resolved_brand_id UUID;
  resolved_role_operator_id UUID;
BEGIN
  current_operator_id := NULLIF(row_data ->> 'operator_organization_id', '')::UUID;
  current_client_id := NULLIF(row_data ->> 'client_organization_id', '')::UUID;
  current_brand_id := NULLIF(row_data ->> 'brand_id', '')::UUID;
  current_workspace_id := NULLIF(row_data ->> 'workspace_id', '')::UUID;
  current_role_id := NULLIF(row_data ->> 'role_id', '')::UUID;

  IF current_client_id IS NOT NULL THEN
    SELECT "operator_organization_id"
      INTO resolved_operator_id
      FROM "client_organizations"
      WHERE "id" = current_client_id;

    IF resolved_operator_id IS DISTINCT FROM current_operator_id THEN
      RAISE EXCEPTION 'client organization is outside the operator tenant';
    END IF;
  END IF;

  IF TG_TABLE_NAME IN ('workspaces', 'memberships', 'invitations')
    AND current_brand_id IS NOT NULL THEN
    SELECT "client_organization_id", "operator_organization_id"
      INTO resolved_client_id, resolved_operator_id
      FROM "brands"
      WHERE "id" = current_brand_id;

    IF resolved_client_id IS DISTINCT FROM current_client_id
      OR resolved_operator_id IS DISTINCT FROM current_operator_id THEN
      RAISE EXCEPTION 'brand is outside the client tenant';
    END IF;
  END IF;

  IF TG_TABLE_NAME IN ('memberships', 'audit_events', 'invitations')
    AND current_workspace_id IS NOT NULL THEN
    SELECT "client_organization_id", "operator_organization_id", "brand_id"
      INTO resolved_client_id, resolved_operator_id, resolved_brand_id
      FROM "workspaces"
      WHERE "id" = current_workspace_id;

    IF resolved_client_id IS DISTINCT FROM current_client_id
      OR resolved_operator_id IS DISTINCT FROM current_operator_id THEN
      RAISE EXCEPTION 'workspace is outside the authorized tenant scope';
    END IF;

    IF TG_TABLE_NAME IN ('memberships', 'invitations')
      AND current_brand_id IS NOT NULL
      AND resolved_brand_id IS DISTINCT FROM current_brand_id THEN
      RAISE EXCEPTION 'workspace brand differs from access scope brand';
    END IF;
  END IF;

  IF TG_TABLE_NAME = 'invitations' THEN
    SELECT "operator_organization_id"
      INTO resolved_role_operator_id
      FROM "roles"
      WHERE "id" = current_role_id;

    IF resolved_role_operator_id IS NOT NULL
      AND resolved_role_operator_id IS DISTINCT FROM current_operator_id THEN
      RAISE EXCEPTION 'invitation role is outside the operator tenant';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
