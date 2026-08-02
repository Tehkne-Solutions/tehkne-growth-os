export type GrowthEvent = {
  id: string;
  workspaceId: string;
  sectorPackId: string;
  sectorPackVersion: string;
  eventType: string;
  occurredAt: Date;
  source: string;
  externalId?: string;
  properties: Record<string, unknown>;
};

export type MetricObservation = {
  id: string;
  workspaceId: string;
  metricId: string;
  periodStart: Date;
  periodEnd: Date;
  value: number;
  currency?: string;
  source: string;
  dimensions: Record<string, string>;
};
