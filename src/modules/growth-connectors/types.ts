export const connectorProviders = ["META_ADS", "GOOGLE_ADS"] as const;
export type ConnectorProvider = (typeof connectorProviders)[number];

export type ConnectorConnectionStatus = "ACTIVE" | "PAUSED" | "ERROR" | "DISCONNECTED";
export type ConnectorSyncStatus = "RUNNING" | "SUCCEEDED" | "FAILED" | "PARTIAL";

export type ConnectorCheckpoint = Readonly<{
  cursor: string | null;
  watermark: Date | null;
  lastSuccessAt: Date | null;
  lastAttemptAt: Date | null;
  consecutiveFailures: number;
}>;

export type ConnectorConnection = Readonly<{
  id: string;
  workspaceId: string;
  provider: ConnectorProvider;
  externalAccountId: string;
  displayName: string;
  status: ConnectorConnectionStatus;
  secretRef: string | null;
  checkpoint: ConnectorCheckpoint | null;
}>;
