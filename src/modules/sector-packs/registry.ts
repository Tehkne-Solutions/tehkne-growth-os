import type { SectorPackManifest } from "./types";

export type SectorPackRegistry = ReadonlyMap<string, SectorPackManifest>;

export function createSectorPackRegistry(packs: SectorPackManifest[]): SectorPackRegistry {
  const registry = new Map<string, SectorPackManifest>();

  for (const pack of packs) {
    const key = `${pack.id}@${pack.version}`;
    if (registry.has(key)) {
      throw new Error(`Duplicate sector pack: ${key}`);
    }
    registry.set(key, pack);
  }

  return registry;
}

export function getActiveSectorPack(
  registry: SectorPackRegistry,
  id: string,
): SectorPackManifest | undefined {
  return [...registry.values()]
    .filter((pack) => pack.id === id && pack.status === "active")
    .sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true }))
    .at(0);
}
