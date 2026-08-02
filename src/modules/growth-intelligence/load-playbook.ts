import { readFile } from "node:fs/promises";
import path from "node:path";

import { validateDeclarativePlaybook, type DeclarativePlaybook } from "./playbooks";

export async function loadDeclarativePlaybook(input: Readonly<{
  sectorPackId: string;
  sectorPackVersion: string;
}>): Promise<DeclarativePlaybook | null> {
  const filePath = path.join(
    process.cwd(),
    "sector-packs",
    input.sectorPackId,
    "playbooks.json",
  );

  try {
    const parsed = JSON.parse(await readFile(filePath, "utf8")) as unknown;
    const playbook = validateDeclarativePlaybook(parsed);
    if (
      playbook.sectorPackId !== input.sectorPackId ||
      playbook.sectorPackVersion !== input.sectorPackVersion
    ) {
      throw new Error("Playbook does not match the committed Sector Pack version");
    }
    return playbook;
  } catch (error) {
    if (isMissingFile(error)) return null;
    throw error;
  }
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT";
}
