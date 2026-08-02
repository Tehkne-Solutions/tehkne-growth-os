import { parseMetricCsvRow, type CsvMetricRow } from "./csv";
import type { MetricObservation } from "./types";

export type CsvImportRejection = {
  row: number;
  reason: string;
  raw: string;
};

export type CsvImportPreview = {
  accepted: MetricObservation[];
  rejected: CsvImportRejection[];
};

const requiredHeaders = ["metric_id", "period_start", "period_end", "value"] as const;

export function previewMetricCsv(
  input: string,
  workspaceId: string,
  idFactory: (row: number) => string,
): CsvImportPreview {
  const lines = input
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);
  const headerLine = lines[0];
  if (headerLine === undefined) throw new Error("CSV is empty");

  const headers = splitCsvLine(headerLine).map((header) => header.trim());
  for (const required of requiredHeaders) {
    if (!headers.includes(required)) {
      throw new Error(`Missing CSV header: ${required}`);
    }
  }

  const accepted: MetricObservation[] = [];
  const rejected: CsvImportRejection[] = [];

  for (let index = 1; index < lines.length; index += 1) {
    const raw = lines[index];
    if (raw === undefined) continue;

    const values = splitCsvLine(raw);
    const row = Object.fromEntries(
      headers.map((header, column) => [header, values[column] ?? ""]),
    ) as CsvMetricRow;

    try {
      accepted.push(parseMetricCsvRow(row, workspaceId, idFactory(index + 1)));
    } catch (error) {
      rejected.push({
        row: index + 1,
        reason: error instanceof Error ? error.message : "Invalid CSV row",
        raw,
      });
    }
  }

  return { accepted, rejected };
}

function splitCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === "," && !quoted) {
      values.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  values.push(current);
  if (quoted) throw new Error("Unclosed quoted CSV field");
  return values;
}
