import { COMMAND_CENTER_PERMISSIONS } from "@/modules/command-center/permissions";
import { GROWTH_INTELLIGENCE_PERMISSIONS } from "@/modules/growth-intelligence/permissions";
import { authorize } from "@/modules/identity";
import type { AuthorizationMembershipStore } from "@/modules/identity/application/contracts";
import { parseTenantContext, type TenantContext } from "@/modules/tenancy";
import type { DatabaseClient } from "@/shared/db/client";

export const CLIENT_TRACKING_HEALTH_STATUSES = [
  "UNKNOWN",
  "PENDING",
  "HEALTHY",
  "DEGRADED",
  "BROKEN",
  "NOT_APPLICABLE",
] as const;

export type ClientTrackingHealthStatus = (typeof CLIENT_TRACKING_HEALTH_STATUSES)[number];

export const CLIENT_TRACKING_HEALTH_CATALOG = [
  { key: "GA4_COLLECTION", label: "GA4 collection", group: "ANALYTICS" },
  { key: "GTM_CONTAINER", label: "GTM container", group: "TAGGING" },
  { key: "GOOGLE_ADS_CONVERSION", label: "Google Ads conversion", group: "MEDIA_SIGNAL" },
  { key: "META_PIXEL_DATASET", label: "Meta Pixel / Dataset", group: "MEDIA_SIGNAL" },
  { key: "CAPI_SERVER_SIDE", label: "CAPI / server-side", group: "SERVER_SIGNAL" },
  { key: "EVENT_DEDUPLICATION", label: "Event deduplication", group: "DATA_QUALITY" },
  { key: "ENHANCED_CONVERSIONS", label: "Enhanced Conversions", group: "DATA_QUALITY" },
  { key: "CONSENT_PRIVACY", label: "Consent / privacy", group: "GOVERNANCE" },
  { key: "END_TO_END_SMOKE", label: "End-to-end conversion smoke", group: "VALIDATION" },
] as const;

export type ClientTrackingHealthItemKey = (typeof CLIENT_TRACKING_HEALTH_CATALOG)[number]["key"];
export type ClientTrackingHealthGroup = (typeof CLIENT_TRACKING_HEALTH_CATALOG)[number]["group"];

export type ClientTrackingHealthItem = Readonly<{
  workspaceId: string;
  itemKey: ClientTrackingHealthItemKey;
  status: ClientTrackingHealthStatus;
  evidenceReference: string | null;
  assessedByUserId: string;
  assessedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}>;

export type ClientTrackingHealthEntry = Readonly<{
  key: ClientTrackingHealthItemKey;
  label: string;
  group: ClientTrackingHealthGroup;
  status: ClientTrackingHealthStatus;
  evidenceReference: string | null;
  assessedAt: Date | null;
}>;

export type ClientTrackingHealth = Readonly<{
  entries: readonly ClientTrackingHealthEntry[];
  overallStatus: Exclude<ClientTrackingHealthStatus, "NOT_APPLICABLE">;
  healthyCount: number;
  degradedCount: number;
  brokenCount: number;
  pendingCount: number;
  notApplicableCount: number;
}>;

export class ClientTrackingHealthWorkspaceRequiredError extends Error {}
export class ClientTrackingHealthValidationError extends Error {}

export async function loadAuthorizedClientTrackingHealth(
  dependencies: Readonly<{
    database: DatabaseClient;
    authorizationStore: AuthorizationMembershipStore;
  }>,
  input: Readonly<{ userId: string; tenant: TenantContext }>,
): Promise<ClientTrackingHealth> {
  const tenant = requireWorkspace(input.tenant);
  await authorize(dependencies.authorizationStore, {
    userId: input.userId,
    tenant,
    permission: COMMAND_CENTER_PERMISSIONS.read,
  });

  const rows = await dependencies.database.$queryRaw<ClientTrackingHealthItem[]>`
    SELECT
      workspace_id AS "workspaceId",
      item_key AS "itemKey",
      status::text AS "status",
      evidence_reference AS "evidenceReference",
      assessed_by_user_id AS "assessedByUserId",
      assessed_at AS "assessedAt",
      created_at AS "createdAt",
      updated_at AS "updatedAt"
    FROM growth_client_tracking_health_items
    WHERE workspace_id = ${tenant.workspaceId}::uuid
  `;

  return buildClientTrackingHealth(rows);
}

export function buildClientTrackingHealth(
  rows: readonly ClientTrackingHealthItem[],
): ClientTrackingHealth {
  const byKey = new Map(rows.map((row) => [row.itemKey, row]));
  const entries = CLIENT_TRACKING_HEALTH_CATALOG.map((definition) => {
    const row = byKey.get(definition.key);
    return {
      key: definition.key,
      label: definition.label,
      group: definition.group,
      status: row?.status ?? "UNKNOWN",
      evidenceReference: row?.evidenceReference ?? null,
      assessedAt: row?.assessedAt ?? null,
    } satisfies ClientTrackingHealthEntry;
  });

  const healthyCount = entries.filter((entry) => entry.status === "HEALTHY").length;
  const degradedCount = entries.filter((entry) => entry.status === "DEGRADED").length;
  const brokenCount = entries.filter((entry) => entry.status === "BROKEN").length;
  const pendingCount = entries.filter((entry) => entry.status === "UNKNOWN" || entry.status === "PENDING").length;
  const notApplicableCount = entries.filter((entry) => entry.status === "NOT_APPLICABLE").length;
  const applicableCount = entries.length - notApplicableCount;

  let overallStatus: ClientTrackingHealth["overallStatus"] = "PENDING";
  if (brokenCount > 0) overallStatus = "BROKEN";
  else if (degradedCount > 0) overallStatus = "DEGRADED";
  else if (applicableCount > 0 && healthyCount === applicableCount) overallStatus = "HEALTHY";
  else if (pendingCount === entries.length) overallStatus = "UNKNOWN";

  return {
    entries,
    overallStatus,
    healthyCount,
    degradedCount,
    brokenCount,
    pendingCount,
    notApplicableCount,
  };
}

export async function updateClientTrackingHealthItem(
  dependencies: Readonly<{
    database: DatabaseClient;
    authorizationStore: AuthorizationMembershipStore;
  }>,
  input: Readonly<{
    userId: string;
    tenant: TenantContext;
    itemKey: ClientTrackingHealthItemKey;
    status: ClientTrackingHealthStatus;
    evidenceReference?: string | null;
  }>,
): Promise<ClientTrackingHealthItem> {
  const tenant = requireWorkspace(input.tenant);
  await authorize(dependencies.authorizationStore, {
    userId: input.userId,
    tenant,
    permission: GROWTH_INTELLIGENCE_PERMISSIONS.manageActions,
  });
  if (!CLIENT_TRACKING_HEALTH_CATALOG.some((item) => item.key === input.itemKey)) {
    throw new ClientTrackingHealthValidationError("Unknown tracking health item key.");
  }
  const evidenceReference = normalizeEvidenceReference(input.evidenceReference);

  return dependencies.database.$transaction(async (transaction) => {
    const rows = await transaction.$queryRaw<ClientTrackingHealthItem[]>`
      INSERT INTO growth_client_tracking_health_items (
        workspace_id,
        item_key,
        status,
        evidence_reference,
        assessed_by_user_id,
        assessed_at
      ) VALUES (
        ${tenant.workspaceId}::uuid,
        ${input.itemKey},
        ${input.status}::"ClientTrackingHealthStatus",
        ${evidenceReference},
        ${input.userId}::uuid,
        CURRENT_TIMESTAMP
      )
      ON CONFLICT (workspace_id, item_key) DO UPDATE SET
        status = EXCLUDED.status,
        evidence_reference = EXCLUDED.evidence_reference,
        assessed_by_user_id = EXCLUDED.assessed_by_user_id,
        assessed_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      RETURNING
        workspace_id AS "workspaceId",
        item_key AS "itemKey",
        status::text AS "status",
        evidence_reference AS "evidenceReference",
        assessed_by_user_id AS "assessedByUserId",
        assessed_at AS "assessedAt",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
    `;
    const item = rows[0];
    if (!item) throw new ClientTrackingHealthValidationError("Unable to persist tracking health evidence.");

    await transaction.auditEvent.create({
      data: {
        operatorOrganizationId: tenant.operatorOrganizationId,
        clientOrganizationId: tenant.clientOrganizationId,
        workspaceId: tenant.workspaceId,
        actorUserId: input.userId,
        action: "growth.client_tracking_health.updated",
        resourceType: "growth_client_tracking_health_item",
        resourceId: `${tenant.workspaceId}:${input.itemKey}`,
        metadata: {
          itemKey: input.itemKey,
          status: input.status,
          hasEvidenceReference: evidenceReference !== null,
          providerSyncImplied: false,
        },
      },
    });

    return item;
  });
}

function normalizeEvidenceReference(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  const reference = value.trim();
  if (reference.length > 240 || /[\r\n]/.test(reference)) {
    throw new ClientTrackingHealthValidationError("Evidence reference is invalid.");
  }
  const normalized = reference.toLowerCase();
  const secretMarkers = ["bearer ", "client_secret", "access_token", "refresh_token", "password=", "authorization:", "ghp_", "github_pat_", "sk-", "ya29."];
  if (secretMarkers.some((marker) => normalized.includes(marker))) {
    throw new ClientTrackingHealthValidationError("Secret-like material is not allowed in tracking evidence.");
  }
  if (reference.length >= 80 && /^[A-Za-z0-9_./+=-]+$/.test(reference)) {
    throw new ClientTrackingHealthValidationError("High-entropy material is not allowed in tracking evidence.");
  }
  return reference;
}

function requireWorkspace(value: TenantContext): TenantContext & {
  clientOrganizationId: string;
  workspaceId: string;
} {
  const tenant = parseTenantContext(value);
  if (!tenant.clientOrganizationId || !tenant.workspaceId) {
    throw new ClientTrackingHealthWorkspaceRequiredError("Tracking health requires an explicit workspace.");
  }
  return tenant as TenantContext & { clientOrganizationId: string; workspaceId: string };
}
