import {
  metricDirections,
  metricUnits,
  sectorPackStatuses,
  type SectorPackManifest,
} from "./types";

const packIdPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const dataIdPattern = /^[a-z0-9]+(?:_[a-z0-9]+)*$/;
const semverPattern = /^\d+\.\d+\.\d+$/;

export function validateSectorPackManifest(value: unknown): SectorPackManifest {
  if (!value || typeof value !== "object") throw new Error("Sector pack must be an object");
  const pack = value as Partial<SectorPackManifest>;

  if (!pack.id || !packIdPattern.test(pack.id)) throw new Error("Invalid sector pack id");
  if (!pack.version || !semverPattern.test(pack.version)) throw new Error("Invalid sector pack version");
  if (!pack.name?.trim()) throw new Error("Sector pack name is required");
  if (!pack.status || !sectorPackStatuses.includes(pack.status)) throw new Error("Invalid sector pack status");
  if (!Array.isArray(pack.funnels) || pack.funnels.length === 0) throw new Error("At least one funnel is required");
  if (!Array.isArray(pack.metrics) || pack.metrics.length === 0) throw new Error("At least one metric is required");
  if (!Array.isArray(pack.events) || pack.events.length === 0) throw new Error("At least one event is required");

  for (const funnel of pack.funnels) {
    if (!funnel.id || !packIdPattern.test(funnel.id) || !funnel.name?.trim()) throw new Error("Invalid funnel");
    if (!Array.isArray(funnel.stages) || funnel.stages.length < 2) throw new Error(`Funnel ${funnel.id} needs at least two stages`);
    if (!funnel.stages.every((stage) => dataIdPattern.test(stage))) {
      throw new Error(`Invalid funnel stage: ${funnel.id}`);
    }
  }

  for (const metric of pack.metrics) {
    if (!metric.id || !dataIdPattern.test(metric.id) || !metric.name?.trim()) throw new Error("Invalid metric");
    if (!metricUnits.includes(metric.unit)) throw new Error(`Invalid metric unit: ${metric.id}`);
    if (!metricDirections.includes(metric.direction)) throw new Error(`Invalid metric direction: ${metric.id}`);
  }

  if (!pack.events.every((event) => dataIdPattern.test(event))) {
    throw new Error("Invalid sector pack event");
  }

  return pack as SectorPackManifest;
}
