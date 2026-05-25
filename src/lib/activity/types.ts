export type RawCsvRow = Record<string, string>;

export type ActivityInput = {
  activityDate: string;
  activityType: string;
  distanceKm: number;
  durationSeconds: number;
  avgPaceSecPerKm: number | null;
  avgHr: number | null;
  maxHr: number | null;
  calories: number | null;
  ascentM: number | null;
  vo2maxEstimate: number | null;
  rawCsvRow: RawCsvRow;
};

export type ActivityErrorSource = "parser" | "validation" | "database" | "upload";

export type ActivityErrorCode =
  | "duplicate"
  | "validation"
  | "unrecognized_csv"
  | "upload_failed";

export type ActivityImportError = {
  code: ActivityErrorCode;
  source: ActivityErrorSource;
  reason: string;
  row?: number;
};

export type ActivityImportResult = {
  inserted: number;
  skipped: number;
  errors: ActivityImportError[];
};

export type ParsedGarminCsv = {
  isRecognized: boolean;
  activities: ActivityInput[];
  skipped: ActivityImportError[];
};
