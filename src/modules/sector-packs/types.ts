export const sectorPackStatuses = ["draft", "active", "deprecated"] as const;
export const metricUnits = ["count", "currency", "percentage", "duration"] as const;
export const metricDirections = ["up", "down", "contextual"] as const;

export type SectorPackStatus = (typeof sectorPackStatuses)[number];
export type MetricUnit = (typeof metricUnits)[number];
export type MetricDirection = (typeof metricDirections)[number];

export type SectorPackMetric = {
  id: string;
  name: string;
  unit: MetricUnit;
  direction: MetricDirection;
};

export type SectorPackFunnel = {
  id: string;
  name: string;
  stages: string[];
};

export type SectorPackManifest = {
  id: string;
  version: string;
  name: string;
  status: SectorPackStatus;
  funnels: SectorPackFunnel[];
  metrics: SectorPackMetric[];
  events: string[];
};
