import Papa from "papaparse";
import { activityInputSchema } from "./schema";
import type { ActivityImportError, ActivityInput, ParsedGarminCsv, RawCsvRow } from "./types";

export const MILES_TO_KM = 1.609344;
export const FEET_TO_METERS = 0.3048;

const REQUIRED_GARMIN_HEADERS = ["Activity Type", "Date", "Distance", "Time"];

export function parseGarminCsv(csv: string): ParsedGarminCsv {
  const rows = Papa.parse<string[]>(csv, {
    skipEmptyLines: "greedy",
  }).data;
  const [headers, ...dataRows] = rows;

  if (headers?.[0]) {
    headers[0] = headers[0].replace(/^\uFEFF/, "");
  }

  if (!headers || !isRecognizedGarminExport(headers)) {
    return {
      isRecognized: false,
      activities: [],
      skipped: [
        {
          code: "unrecognized_csv",
          source: "parser",
          reason: "Upload a Garmin activity export CSV with Activity Type, Date, Distance, and Time columns.",
        },
      ],
    };
  }

  const activities: ActivityInput[] = [];
  const skipped: ActivityImportError[] = [];

  dataRows.forEach((values, index) => {
    if (values.every((value) => value.trim() === "")) {
      return;
    }

    const rawCsvRow = toRawCsvRow(headers, values);
    const activity = mapGarminRow(rawCsvRow);
    const parsed = activityInputSchema.safeParse(activity);

    if (!parsed.success) {
      skipped.push({
        code: "validation",
        source: "parser",
        row: index + 2,
        reason: parsed.error.issues
          .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
          .join("; "),
      });
      return;
    }

    activities.push(parsed.data);
  });

  return {
    isRecognized: true,
    activities,
    skipped,
  };
}

function isRecognizedGarminExport(headers: string[]): boolean {
  return REQUIRED_GARMIN_HEADERS.every((header) => headers.includes(header));
}

function mapGarminRow(rawCsvRow: RawCsvRow): ActivityInput {
  const distanceMiles = parseRequiredNumber(rawCsvRow.Distance);
  const durationSeconds = parseClockSeconds(rawCsvRow.Time);
  const paceSecondsPerMile = parseClockSeconds(rawCsvRow["Avg Pace"]);
  const ascentFeet = parseOptionalNumber(rawCsvRow["Total Ascent"]);

  return {
    activityDate: parseGarminDate(rawCsvRow.Date),
    activityType: normalizeCell(rawCsvRow["Activity Type"]),
    distanceKm: distanceMiles === null ? Number.NaN : roundTo(distanceMiles * MILES_TO_KM, 3),
    durationSeconds: durationSeconds ?? Number.NaN,
    avgPaceSecPerKm: derivePace(durationSeconds, distanceMiles, paceSecondsPerMile),
    avgHr: parseOptionalInteger(rawCsvRow["Avg HR"]),
    maxHr: parseOptionalInteger(rawCsvRow["Max HR"]),
    calories: parseOptionalInteger(rawCsvRow.Calories),
    ascentM: ascentFeet === null ? null : Math.round(ascentFeet * FEET_TO_METERS),
    vo2maxEstimate: parseOptionalNumber(findFirst(rawCsvRow, ["VO2 Max", "VO2max", "VO2 Max Estimate"])),
    rawCsvRow,
  };
}

function derivePace(
  durationSeconds: number | null,
  distanceMiles: number | null,
  paceSecondsPerMile: number | null,
): number | null {
  if (durationSeconds !== null && distanceMiles !== null && distanceMiles > 0) {
    return Math.round(durationSeconds / (distanceMiles * MILES_TO_KM));
  }

  return paceSecondsPerMile === null ? null : Math.round(paceSecondsPerMile / MILES_TO_KM);
}

function parseGarminDate(value: string | undefined): string {
  const normalized = normalizeCell(value);

  if (!normalized) {
    return "";
  }

  const date = new Date(`${normalized.replace(" ", "T")}Z`);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toISOString();
}

function parseRequiredNumber(value: string | undefined): number | null {
  return parseOptionalNumber(value);
}

function parseOptionalInteger(value: string | undefined): number | null {
  const parsed = parseOptionalNumber(value);
  return parsed === null ? null : Math.round(parsed);
}

function parseOptionalNumber(value: string | undefined): number | null {
  const normalized = normalizeCell(value);

  if (!normalized || normalized === "--") {
    return null;
  }

  const parsed = Number(normalized.replaceAll(",", ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function parseClockSeconds(value: string | undefined): number | null {
  const normalized = normalizeCell(value);

  if (!normalized || normalized === "--") {
    return null;
  }

  const parts = normalized.split(":").map(Number);

  if (parts.some((part) => Number.isNaN(part))) {
    return null;
  }

  if (parts.length === 3) {
    return Math.round(parts[0] * 3600 + parts[1] * 60 + parts[2]);
  }

  if (parts.length === 2) {
    return Math.round(parts[0] * 60 + parts[1]);
  }

  return null;
}

function findFirst(row: RawCsvRow, fieldNames: string[]): string | undefined {
  for (const fieldName of fieldNames) {
    if (row[fieldName] !== undefined) {
      return row[fieldName];
    }
  }

  return undefined;
}

function toRawCsvRow(headers: string[], values: string[]): RawCsvRow {
  return headers.reduce<RawCsvRow>((row, header, index) => {
    row[header] = values[index] ?? "";
    return row;
  }, {});
}

function normalizeCell(value: string | undefined): string {
  return value?.trim() ?? "";
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
