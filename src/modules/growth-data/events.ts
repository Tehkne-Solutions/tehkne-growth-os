import type { SectorPackManifest } from "@/modules/sector-packs/types";
import type { GrowthEvent } from "./types";

export function assertEventBelongsToPack(
  pack: SectorPackManifest,
  event: Pick<GrowthEvent, "eventType">,
): void {
  if (!pack.events.includes(event.eventType)) {
    throw new Error(`Event ${event.eventType} is not declared by sector pack ${pack.id}`);
  }
}

export function eventDeduplicationKey(
  event: Pick<GrowthEvent, "workspaceId" | "source" | "externalId" | "id">,
): string {
  return `${event.workspaceId}:${event.source}:${event.externalId ?? event.id}`;
}
