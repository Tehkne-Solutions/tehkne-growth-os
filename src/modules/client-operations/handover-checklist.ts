import { COMMAND_CENTER_PERMISSIONS } from "@/modules/command-center/permissions";
import { GROWTH_INTELLIGENCE_PERMISSIONS } from "@/modules/growth-intelligence/permissions";
import { authorize } from "@/modules/identity";
import type { AuthorizationMembershipStore } from "@/modules/identity/application/contracts";
import { parseTenantContext, type TenantContext } from "@/modules/tenancy";
import type { DatabaseClient } from "@/shared/db/client";

export const CLIENT_HANDOVER_ITEM_STATUSES = [
  "PENDING",
  "IN_PROGRESS",
  "VERIFIED",
  "BLOCKED",
  "NOT_APPLICABLE",
] as const;

export type ClientHandoverItemStatus = (typeof CLIENT_HANDOVER_ITEM_STATUSES)[number];

export const CLIENT_HANDOVER_CATALOG = [
  { key: "GOOGLE_ADS_MCC", label: "Google Ads / MCC", group: "MEDIA" },
  { key: "META_PARTNER_ACCESS", label: "Meta partner access", group: "MEDIA" },
  { key: "GA4", label: "Google Analytics 4", group: "MEASUREMENT" },
  { key: "GTM", label: "Google Tag Manager", group: "MEASUREMENT" },
  { key: "WEBSITE_CMS", label: "Website / CMS", group: "OWNERSHIP" },
  { key: "LANDING_PAGES", label: "Landing pages", group: "OWNERSHIP" },
  { key: "HUBSPOT_CRM", label: "HubSpot / CRM", group: "CRM" },
  { key: "META_PIXEL_DATASET", label: "Meta Pixel / Dataset", group: "MEASUREMENT" },
  { key: "CONVERSIONS_API", label: "Conversions API / server-side", group: "MEASUREMENT" },
  { key: "DOMAIN_OWNERSHIP", label: "Domain ownership", group: "OWNERSHIP" },
  { key: "BILLING_OWNER", label: "Billing owner", group: "GOVERNANCE" },
  { key: "TRACKING_SMOKE", label: "End-to-end tracking smoke", group: "VALIDATION" },
  { key: "HANDOVER_CUTOVER", label: "Handover cutover", group: "VALIDATION" },
] as const;

export type ClientHandoverItemKey = (typeof CLIENT_HANDOVER_CATALOG)[number]["key"];
export type ClientHandoverItemGroup = (typeof CLIENT_HANDOVER_CATALOG)[number]["group"];

export type ClientHandoverItem = Readonly<{
  workspaceId: string;
  itemKey: ClientHandoverItemKey;
  status: ClientHandoverItemStatus;
  externalReference: string | null;
  verifiedByUserId: string | null;
  verifiedAt: Date | null;
  updatedByUserId: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}>;

export type ClientHandoverChecklistEntry = Readonly<{
  key: ClientHandoverItemKey;
  label: string;
  group: ClientHandoverItemGroup;
  status: ClientHandoverItemStatus;
  externalReference: string | null;
  verifiedAt: Date | null;
}>;

export type ClientHandoverChecklist = Readonly<{
  entries: readonly ClientHandoverChecklistEntry[];
  verifiedCount: number;
  notApplicableCount: number;
  blockedCount: number;
  pendingCount: number;
  complete: boolean;
}>;

export class ClientHandoverWorkspaceRequiredError extends Error {}
export class ClientHandoverValidationError extends Error {}

export async function loadAuthorizedClientHandoverChecklist(
  dependencies: Readonly<{
    database: DatabaseClient;
    authorizationStore: AuthorizationMembershipStore;
  }>,
  input: Readonly<{ userId: string; tenant: TenantContext }>,
): Promise<ClientHandoverChecklist> {
  const tenant = requireWorkspace(input.tenant);
  await authorize(dependencies.authorizationStore, {
    userId: input.userId,
    tenant,
    permission: COMMAND_CENTER_PERMISSIONS.read,
  });

  const rows = await dependencies.database.$queryRaw<ClientHandoverItem[]>`
    SELECT
      workspace_id AS "workspaceId",
      item_key AS "itemKey",
      status::text AS "status",
      external_reference AS "externalReference",
      verified_by_user_id AS "verifiedByUserId",
      verified_at AS "verifiedAt",
      updated_by_user_id AS "updatedByUserId",
      created_at AS "createdAt",
      updated_at AS "updatedAt"
    FROM growth_client_handover_items
    WHERE workspace_id = ${tenant.workspaceId}::uuid
  `;

  return buildClientHandoverChecklist(rows);
}

export function buildClientHandoverChecklist(
  rows: readonly ClientHandoverItem[],
): ClientHandoverChecklist {
  const byKey = new Map(rows.map((row) => [row.itemKey, row]));
  const entries = CLIENT_HANDOVER_CATALOG.map((definition) => {
    const row = byKey.get(definition.key);
    return {
      key: definition.key,
      label: definition.label,
      group: definition.group,
      status: row?.status ?? "PENDING",
      externalReference: row?.externalReference ?? null,
      verifiedAt: row?.verifiedAt ?? null,
    } satisfies ClientHandoverChecklistEntry;
  });
  const verifiedCount = entries.filter((entry) => entry.status === "VERIFIED").length;
  const notApplicableCount = entries.filter((entry) => entry.status === "NOT_APPLICABLE").length;
  const blockedCount = entries.filter((entry) => entry.status === "BLOCKED").length;
  const pendingCount = entries.filter((entry) => entry.status === "PENDING" || entry.status === "IN_PROGRESS").length;

  return {
    entries,
    verifiedCount,
    notApplicableCount,
    blockedCount,
    pendingCount,
    complete: blockedCount === 0 && pendingCount === 0 && verifiedCount + notApplicableCount === entries.length,
  };
}

export async function updateClientHandoverItem(
  dependencies: Readonly<{
    database: DatabaseClient;
    authorizationStore: AuthorizationMembershipStore;
  }>,
  input: Readonly<{
    userId: string;
    tenant: TenantContext;
    itemKey: ClientHandoverItemKey;
    status: ClientHandoverItemStatus;
    externalReference?: string | null;
  }>,
): Promise<ClientHandoverItem> {
  const tenant = requireWorkspace(input.tenant);
  await authorize(dependencies.authorizationStore, {
    userId: input.userId,
    tenant,
    permission: GROWTH_INTELLIGENCE_PERMISSIONS.manageActions,
  });

  if (!CLIENT_HANDOVER_CATALOG.some((item) => item.key === input.itemKey)) {
    throw new ClientHandoverValidationError("Unknown handover item key.");
  }
  if (!CLIENT_HANDOVER_ITEM_STATUSES.includes(input.status)) {
    throw new ClientHandoverValidationError("Unknown handover item status.");
  }
  const externalReference = normalizeExternalReference(input.externalReference);
  const verifiedByUserId = input.status === "VERIFIED" ? input.userId : null;

  return dependencies.database.$transaction(async (transaction) => {
    const rows = await transaction.$queryRaw<ClientHandoverItem[]>`
      INSERT INTO growth_client_handover_items (
        workspace_id,
        item_key,
        status,
        external_reference,
        verified_by_user_id,
        verified_at,
        updated_by_user_id
      ) VALUES (
        ${tenant.workspaceId}::uuid,
        ${input.itemKey},
        ${input.status}::"ClientHandoverItemStatus",
        ${externalReference},
        ${verifiedByUserId}::uuid,
        CASE WHEN ${input.status} = 'VERIFIED' THEN CURRENT_TIMESTAMP ELSE NULL END,
        ${input.userId}::uuid
      )
      ON CONFLICT (workspace_id, item_key) DO UPDATE SET
        status = EXCLUDED.status,
        external_reference = EXCLUDED.external_reference,
        verified_by_user_id = EXCLUDED.verified_by_user_id,
        verified_at = EXCLUDED.verified_at,
        updated_by_user_id = EXCLUDED.updated_by_user_id,
        updated_at = CURRENT_TIMESTAMP
      RETURNING
        workspace_id AS "workspaceId",
        item_key AS "itemKey",
        status::text AS "status",
        external_reference AS "externalReference",
        verified_by_user_id AS "verifiedByUserId",
        verified_at AS "verifiedAt",
        updated_by_user_id AS "updatedByUserId",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
    `;
    const item = rows[0];
    if (!item) throw new ClientHandoverValidationError("Unable to persist handover evidence.");

    await transaction.auditEvent.create({
      data: {
        operatorOrganizationId: tenant.operatorOrganizationId,
        clientOrganizationId: tenant.clientOrganizationId,
        workspaceId: tenant.workspaceId,
        actorUserId: input.userId,
        action: "growth.client_handover.updated",
        resourceType: "growth_client_handover_item",
        resourceId: `${tenant.workspaceId}:${input.itemKey}`,
        metadata: {
          itemKey: input.itemKey,
          status: input.status,
          hasExternalReference: externalReference !== null,
          secretMaterialStored: false,
        },
      },
    });

    return item;
  });
}

function normalizeExternalReference(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  const reference = value.trim();
  if (reference.length > 240 || /[\r\n]/.test(reference)) {
    throw new ClientHandoverValidationError("External reference is invalid.");
  }
  if (looksSensitive(reference)) {
    throw new ClientHandoverValidationError("Secret-like material is not allowed in handover evidence.");
  }
  return reference;
}

function looksSensitive(value: string): boolean {
  const normalized = value.toLowerCase();
  const blockedMarkers = [
    "bearer ",
    "client_secret",
    "access_token",
    "refresh_token",
    "private_app",
    "api_key",
    "password=",
    "authorization:",
    "ghp_",
    "github_pat_",
    "sk-",
    "ya29.",
  ];
  if (blockedMarkers.some((marker) => normalized.includes(marker))) return true;
  return value.length >= 80 && /^[A-Za-z0-9_./+=-]+$/.test(value);
}

function requireWorkspace(value: TenantContext): TenantContext & {
  clientOrganizationId: string;
  workspaceId: string;
} {
  const tenant = parseTenantContext(value);
  if (!tenant.clientOrganizationId || !tenant.workspaceId) {
    throw new ClientHandoverWorkspaceRequiredError("Client handover requires an explicit workspace.");
  }
  return tenant as TenantContext & { clientOrganizationId: string; workspaceId: string };
}
