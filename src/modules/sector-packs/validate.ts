import {
  metricDirections,
  metricUnits,
  sectorPackStatuses,
  type SectorPackManifest,
} from "./types";

const idPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const semverPattern = /^\d+\.\d+\.\d+$/;

export function validateSectorPackManifest(value: unknown): SectorPackManifest {
  if (!value || typeof value !== "object") throw new Error("Sector pack must be an object");
  const pack = value as Partial<SectorPackManifest>;

  if (!pack.id || !idPattern.test(pack.id)) throw new Error("Invalid sector pack id");
  if (!pack.version || !semverPattern.test(pack.version)) throw new Error("Invalid sector pack version");
  if (!pack.name?.trim()) throw new Error("Sector pack name is required");
  if (!pack.status || !sectorPackStatuses.includes(pack.status)) throw new Error("Invalid sector pack status");
  if (!Array.isArray(pack.funnels) || pack.funnels.length === 0) throw new Error("At least one funnel is required");
  if (!Array.isArray(pack.metrics) || pack.metrics.length === 0) throw new Error("At least one metric is required");
  if (!Array.isArray(pack.events) || pack.events.length === 0) throw new Error("At least one event is required");

  for (const funnel of pack.funnels) {
    if (!funnel.id || !idPattern.test(funnel.id) || !funnel.name?.trim()) throw new Error("Invalid funnel");
    if (!Array.isArray(funnel.stages) || funnel.stages.length < 2) throw new Error(`Funnel ${funnel.id} needs at least two stages`);
  }

  for (const metric of pack.metrics) {
    if (!metric.id || !idPattern.test(metric.id) || !metric.name?.trim()) throw new Error("Invalid metric");
    if (!metricUnits.includes(metric.unit)) throw new Error(`Invalid metric unit: ${metric.id}`);
    if (!metricDirections.includes(metric.direction)) throw new Error(`Invalid metric direction: ${metric.id}`);
  }

  return pack as SectorPackManifest;
}
