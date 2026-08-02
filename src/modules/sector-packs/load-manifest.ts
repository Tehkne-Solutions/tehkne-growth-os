import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type { SectorPackManifest } from "./types";
import { validateSectorPackManifest } from "./validate";

export async function loadSectorPackManifest(input: {
  id: string;
  version: string;
}): Promise<SectorPackManifest> {
  const path = join(process.cwd(), "sector-packs", input.id, "manifest.json");
  const raw = await readFile(path, "utf8");
  const pack = validateSectorPackManifest(JSON.parse(raw) as unknown);

  if (pack.id !== input.id || pack.version !== input.version) {
    throw new Error(`Sector pack version mismatch: expected ${input.id}@${input.version}`);
  }

  return pack;
}
