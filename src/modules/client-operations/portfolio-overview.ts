import { listAuthorizedCommandCenterWorkspaces } from "@/modules/command-center/workspaces";
import { listControlPlaneAlerts } from "@/modules/growth-connectors/control-plane";
import type { AuthorizationMembershipStore } from "@/modules/identity/application/contracts";
import type { DatabaseClient } from "@/shared/db/client";

import {
  buildClientTrackingHealth,
  type ClientTrackingHealthItem,
} from "./tracking-health";

export const CLIENT_PORTFOLIO_ATTENTION_STATES = [
  "NO_ACTION",
  "WATCH",
  "ACTION_REQUIRED",
  "CRITICAL",
] as const;

export type ClientPortfolioAttentionState = (typeof CLIENT_PORTFOLIO_ATTENTION_STATES)[number];

export type ClientPortfolioRow = Readonly<{
  workspaceId: string;
  operatorOrganizationId: string;
  clientOrganizationId: string;
  brandId: string | null;
  workspaceName: string;
  clientName: string;
  brandName: string | null;
  lifecycleState: string | null;
  handoverVerified: number;
  handoverNotApplicable: number;
  handoverBlocked: number;
  handoverPending: number;
  handoverTotal: number;
  handoverComplete: boolean;
  trackingStatus: "UNKNOWN" | "PENDING" | "HEALTHY" | "DEGRADED" | "BROKEN";
  activeConnectors: number;
  connectorAlerts: number;
  connectorCriticalAlerts: number;
  latestConnectorSuccessAt: Date | null;
  openActions: number;
  inProgressActions: number;
  attention: ClientPortfolioAttentionState;
  reasons: readonly string[];
}>;

export type ClientPortfolioOverview = Readonly<{
  rows: readonly ClientPortfolioRow[];
  counts: Readonly<Record<ClientPortfolioAttentionState, number>>;
}>;

type WorkspaceIdentity = Readonly<{
  id: string;
  name: string;
  operatorOrganizationId: string;
  clientOrganizationId: string;
  brandId: string | null;
  clientOrganization: Readonly<{ name: string }>;
  brand: Readonly<{ name: string }> | null;
}>;

type ProfileRow = Readonly<{ workspaceId: string; lifecycleState: string }>;
type HandoverAggregateRow = Readonly<{
  workspaceId: string;
  verified: number;
  notApplicable: number;
  blocked: number;
  pending: number;
  total: number;
}>;
type ConnectorAggregateRow = Readonly<{
  workspaceId: string;
  activeConnectors: number;
  latestSuccessAt: Date | null;
}>;
type ActionAggregateRow = Readonly<{
  workspaceId: string;
  openActions: number;
  inProgressActions: number;
}>;

export async function loadAuthorizedClientPortfolioOverview(
  dependencies: Readonly<{
    database: DatabaseClient;
    authorizationStore: AuthorizationMembershipStore;
  }>,
  input: Readonly<{
    userId: string;
    operatorOrganizationId: string;
  }>,
  now = new Date(),
): Promise<ClientPortfolioOverview> {
  const authorized = await listAuthorizedCommandCenterWorkspaces(dependencies, input);
  const workspaceIds = authorized.map((workspace) => workspace.id);
  if (workspaceIds.length === 0) return emptyOverview();

  const workspaceIdentities = await dependencies.database.workspace.findMany({
    where: {
      id: { in: workspaceIds },
      status: "ACTIVE",
      operatorOrganizationId: input.operatorOrganizationId,
    },
    select: {
      id: true,
      name: true,
      operatorOrganizationId: true,
      clientOrganizationId: true,
      brandId: true,
      clientOrganization: { select: { name: true } },
      brand: { select: { name: true } },
    },
  }) as WorkspaceIdentity[];

  const idArray = workspaceIds;
  const [profiles, handover, trackingRows, connectors, actions, globalAlerts] = await Promise.all([
    dependencies.database.$queryRaw<ProfileRow[]>`
      SELECT workspace_id AS "workspaceId", lifecycle_state::text AS "lifecycleState"
      FROM growth_client_profiles
      WHERE workspace_id = ANY(${idArray}::uuid[])
    `,
    dependencies.database.$queryRaw<HandoverAggregateRow[]>`
      SELECT
        workspace_id AS "workspaceId",
        COUNT(*) FILTER (WHERE status = 'VERIFIED')::int AS verified,
        COUNT(*) FILTER (WHERE status = 'NOT_APPLICABLE')::int AS "notApplicable",
        COUNT(*) FILTER (WHERE status = 'BLOCKED')::int AS blocked,
        COUNT(*) FILTER (WHERE status IN ('PENDING','IN_PROGRESS'))::int AS pending,
        COUNT(*)::int AS total
      FROM growth_client_handover_items
      WHERE workspace_id = ANY(${idArray}::uuid[])
      GROUP BY workspace_id
    `,
    dependencies.database.$queryRaw<ClientTrackingHealthItem[]>`
      SELECT
        workspace_id AS "workspaceId",
        item_key AS "itemKey",
        status::text AS status,
        evidence_reference AS "evidenceReference",
        assessed_by_user_id AS "assessedByUserId",
        assessed_at AS "assessedAt",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM growth_client_tracking_health_items
      WHERE workspace_id = ANY(${idArray}::uuid[])
    `,
    dependencies.database.$queryRaw<ConnectorAggregateRow[]>`
      SELECT
        c.workspace_id AS "workspaceId",
        COUNT(*) FILTER (WHERE c.status = 'ACTIVE')::int AS "activeConnectors",
        MAX(cp.last_success_at) AS "latestSuccessAt"
      FROM growth_connector_connections c
      LEFT JOIN growth_connector_checkpoints cp ON cp.connection_id = c.id
      WHERE c.workspace_id = ANY(${idArray}::uuid[])
      GROUP BY c.workspace_id
    `,
    dependencies.database.$queryRaw<ActionAggregateRow[]>`
      SELECT
        workspace_id AS "workspaceId",
        COUNT(*) FILTER (WHERE status IN ('OPEN','ACCEPTED'))::int AS "openActions",
        COUNT(*) FILTER (WHERE status = 'IN_PROGRESS')::int AS "inProgressActions"
      FROM growth_action_items
      WHERE workspace_id = ANY(${idArray}::uuid[])
      GROUP BY workspace_id
    `,
    listControlPlaneAlerts(dependencies.database, now),
  ]);

  const profileByWorkspace = new Map(profiles.map((row) => [row.workspaceId, row]));
  const handoverByWorkspace = new Map(handover.map((row) => [row.workspaceId, row]));
  const connectorByWorkspace = new Map(connectors.map((row) => [row.workspaceId, row]));
  const actionByWorkspace = new Map(actions.map((row) => [row.workspaceId, row]));
  const trackingByWorkspace = groupBy(trackingRows, (row) => row.workspaceId);
  const alertsByWorkspace = groupBy(
    globalAlerts.filter((alert) => workspaceIds.includes(alert.workspaceId)),
    (alert) => alert.workspaceId,
  );

  const rows = workspaceIdentities.map((workspace) => {
    const profile = profileByWorkspace.get(workspace.id);
    const handoverRow = handoverByWorkspace.get(workspace.id);
    const tracking = buildClientTrackingHealth(trackingByWorkspace.get(workspace.id) ?? []);
    const connector = connectorByWorkspace.get(workspace.id);
    const action = actionByWorkspace.get(workspace.id);
    const alerts = alertsByWorkspace.get(workspace.id) ?? [];
    const connectorCriticalAlerts = alerts.filter((alert) =>
      alert.reason === "connection_error" || alert.reason === "repeated_failures",
    ).length;
    const handoverTotal = handoverRow?.total ?? 0;
    const handoverVerified = handoverRow?.verified ?? 0;
    const handoverNotApplicable = handoverRow?.notApplicable ?? 0;
    const handoverBlocked = handoverRow?.blocked ?? 0;
    const handoverPending = handoverRow?.pending ?? 13;
    const handoverComplete = handoverTotal === 13
      && handoverBlocked === 0
      && handoverPending === 0
      && handoverVerified + handoverNotApplicable === 13;

    const attention = classifyClientPortfolioAttention({
      lifecycleState: profile?.lifecycleState ?? null,
      handoverComplete,
      handoverBlocked,
      trackingStatus: tracking.overallStatus,
      connectorAlerts: alerts.length,
      connectorCriticalAlerts,
      openActions: action?.openActions ?? 0,
      inProgressActions: action?.inProgressActions ?? 0,
    });

    return {
      workspaceId: workspace.id,
      operatorOrganizationId: workspace.operatorOrganizationId,
      clientOrganizationId: workspace.clientOrganizationId,
      brandId: workspace.brandId,
      workspaceName: workspace.name,
      clientName: workspace.clientOrganization.name,
      brandName: workspace.brand?.name ?? null,
      lifecycleState: profile?.lifecycleState ?? null,
      handoverVerified,
      handoverNotApplicable,
      handoverBlocked,
      handoverPending,
      handoverTotal,
      handoverComplete,
      trackingStatus: tracking.overallStatus,
      activeConnectors: connector?.activeConnectors ?? 0,
      connectorAlerts: alerts.length,
      connectorCriticalAlerts,
      latestConnectorSuccessAt: connector?.latestSuccessAt ?? null,
      openActions: action?.openActions ?? 0,
      inProgressActions: action?.inProgressActions ?? 0,
      attention: attention.state,
      reasons: attention.reasons,
    } satisfies ClientPortfolioRow;
  }).sort(comparePortfolioRows);

  return {
    rows,
    counts: {
      NO_ACTION: rows.filter((row) => row.attention === "NO_ACTION").length,
      WATCH: rows.filter((row) => row.attention === "WATCH").length,
      ACTION_REQUIRED: rows.filter((row) => row.attention === "ACTION_REQUIRED").length,
      CRITICAL: rows.filter((row) => row.attention === "CRITICAL").length,
    },
  };
}

export function classifyClientPortfolioAttention(input: Readonly<{
  lifecycleState: string | null;
  handoverComplete: boolean;
  handoverBlocked: number;
  trackingStatus: ClientPortfolioRow["trackingStatus"];
  connectorAlerts: number;
  connectorCriticalAlerts: number;
  openActions: number;
  inProgressActions: number;
}>): Readonly<{ state: ClientPortfolioAttentionState; reasons: readonly string[] }> {
  const critical: string[] = [];
  const actionRequired: string[] = [];
  const watch: string[] = [];

  if (input.trackingStatus === "BROKEN") critical.push("tracking_broken");
  if (input.connectorCriticalAlerts > 0) critical.push("critical_connector_alert");
  if (critical.length > 0) return { state: "CRITICAL", reasons: critical };

  if (input.lifecycleState === "AT_RISK") actionRequired.push("lifecycle_at_risk");
  if (input.handoverBlocked > 0) actionRequired.push("handover_blocked");
  if (input.trackingStatus === "DEGRADED") actionRequired.push("tracking_degraded");
  if (input.connectorAlerts > 0) actionRequired.push("connector_attention");
  if (input.openActions + input.inProgressActions > 0) actionRequired.push("growth_actions_open");
  if (actionRequired.length > 0) return { state: "ACTION_REQUIRED", reasons: actionRequired };

  if (!input.lifecycleState) watch.push("intake_missing");
  if (!input.handoverComplete) watch.push("handover_incomplete");
  if (input.trackingStatus === "UNKNOWN" || input.trackingStatus === "PENDING") watch.push("tracking_unverified");
  if (input.lifecycleState === "PAUSED" || input.lifecycleState === "OFFBOARDING") watch.push("lifecycle_non_operating");
  if (watch.length > 0) return { state: "WATCH", reasons: watch };

  return { state: "NO_ACTION", reasons: [] };
}

function comparePortfolioRows(a: ClientPortfolioRow, b: ClientPortfolioRow) {
  const rank: Record<ClientPortfolioAttentionState, number> = {
    CRITICAL: 0,
    ACTION_REQUIRED: 1,
    WATCH: 2,
    NO_ACTION: 3,
  };
  return rank[a.attention] - rank[b.attention]
    || a.clientName.localeCompare(b.clientName, "pt-BR")
    || a.workspaceName.localeCompare(b.workspaceName, "pt-BR");
}

function groupBy<T, K>(rows: readonly T[], key: (row: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const row of rows) {
    const value = key(row);
    const group = map.get(value) ?? [];
    group.push(row);
    map.set(value, group);
  }
  return map;
}

function emptyOverview(): ClientPortfolioOverview {
  return {
    rows: [],
    counts: { NO_ACTION: 0, WATCH: 0, ACTION_REQUIRED: 0, CRITICAL: 0 },
  };
}
