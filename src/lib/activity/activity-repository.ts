import { z } from "zod";
import { activityInputSchema } from "./schema";
import type {
  Activity,
  ActivityImportError,
  ActivityImportResult,
  ActivityInput,
  ActivityRepository,
} from "./types";

const DEFAULT_SUPABASE_UPLOAD_TIMEOUT_MS = 10_000;
const SUPABASE_UPLOAD_FAILED_REASON =
  "Supabase upload failed. Try again after checking the database connection.";

type ValidActivityRow = {
  activity: ActivityInput;
  sourceRow: number;
};

type DatabaseActivityRow = {
  id: string;
  activity_date: string;
  activity_type: string;
  distance_km: number | string;
  duration_seconds: number;
  avg_pace_sec_per_km: number | null;
  avg_hr: number | null;
  max_hr: number | null;
  calories: number | null;
  ascent_m: number | null;
  vo2max_estimate: number | string | null;
  raw_csv_row: Record<string, string>;
  created_at: string;
};

const numericDatabaseFieldSchema = z.union([z.number(), z.string()]);

const activityRowSchema = z.object({
  id: z.string().min(1),
  activity_date: z.string().refine((value) => !Number.isNaN(Date.parse(value)), {
    message: "activity_date must be a valid date",
  }),
  activity_type: z.string().min(1),
  distance_km: numericDatabaseFieldSchema.refine((value) => Number.isFinite(Number(value)), {
    message: "distance_km must be numeric",
  }),
  duration_seconds: z.number().int().positive(),
  avg_pace_sec_per_km: z.number().int().nonnegative().nullable(),
  avg_hr: z.number().int().nonnegative().nullable(),
  max_hr: z.number().int().nonnegative().nullable(),
  calories: z.number().int().nonnegative().nullable(),
  ascent_m: z.number().int().nonnegative().nullable(),
  vo2max_estimate: numericDatabaseFieldSchema
    .refine((value) => Number.isFinite(Number(value)), {
      message: "vo2max_estimate must be numeric",
    })
    .nullable(),
  raw_csv_row: z.record(z.string(), z.string()),
  created_at: z.string().refine((value) => !Number.isNaN(Date.parse(value)), {
    message: "created_at must be a valid date",
  }),
});

const activityRowsSchema = z.array(activityRowSchema);

export function createInMemoryActivityRepository(): ActivityRepository {
  const activities = new Map<string, Activity>();

  return {
    async insertActivities(rows) {
      const errors: ActivityImportError[] = [];
      let inserted = 0;
      let skipped = 0;

      rows.forEach((row, index) => {
        const parsed = activityInputSchema.safeParse(row);

        if (!parsed.success) {
          skipped += 1;
          errors.push({
            code: "validation",
            source: "validation",
            row: index + 1,
            reason: parsed.error.issues
              .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
              .join("; "),
          });
          return;
        }

        const key = dedupeKey(parsed.data);

        if (activities.has(key)) {
          skipped += 1;
          errors.push({
            code: "duplicate",
            source: "database",
            row: index + 1,
            reason: "Activity already exists for this date, type, and distance.",
          });
          return;
        }

        activities.set(key, {
          ...parsed.data,
          id: crypto.randomUUID(),
          createdAt: new Date().toISOString(),
        });
        inserted += 1;
      });

      return { inserted, skipped, errors };
    },

    async getActivities() {
      return sortActivities([...activities.values()]);
    },

    async getRecentActivities(options) {
      const now = options.now ?? new Date();
      const since = monthsBefore(now, options.months);

      return sortActivities(
        [...activities.values()].filter((activity) => {
          const activityDate = new Date(activity.activityDate);
          return activityDate >= since && activityDate <= now;
        }),
      );
    },
  };
}

export function createSupabaseActivityRepository(): ActivityRepository {
  return {
    async insertActivities(rows) {
      const validRows: ValidActivityRow[] = [];
      const errors: ActivityImportError[] = [];
      let skipped = 0;

      rows.forEach((row, index) => {
        const parsed = activityInputSchema.safeParse(row);

        if (!parsed.success) {
          skipped += 1;
          errors.push({
            code: "validation",
            source: "validation",
            row: index + 1,
            reason: parsed.error.issues
              .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
              .join("; "),
          });
          return;
        }

        validRows.push({
          activity: parsed.data,
          sourceRow: index + 1,
        });
      });

      if (validRows.length === 0) {
        return { inserted: 0, skipped, errors };
      }

      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      if (!supabaseUrl || !supabaseAnonKey) {
        const memoryResult = await createInMemoryActivityRepository().insertActivities(
          validRows.map((row) => row.activity),
        );
        return {
          inserted: memoryResult.inserted,
          skipped: skipped + memoryResult.skipped,
          errors: [...errors, ...memoryResult.errors],
        };
      }

      const abortController = new AbortController();
      const timeoutId = setTimeout(
        () => abortController.abort(),
        getSupabaseUploadTimeoutMs(),
      );

      try {
        const response = await fetch(
          `${supabaseUrl}/rest/v1/activities?on_conflict=activity_date,activity_type,distance_km`,
          {
            method: "POST",
            headers: {
              apikey: supabaseAnonKey,
              Authorization: `Bearer ${supabaseAnonKey}`,
              "Content-Type": "application/json",
              Prefer: "resolution=ignore-duplicates,return=representation",
            },
            body: JSON.stringify(validRows.map((row) => toDatabaseRow(row.activity))),
            signal: abortController.signal,
          },
        );

        if (!response.ok) {
          return uploadFailedResult(skipped, validRows.length, errors);
        }

        const insertedRows = await response.json();

        if (!Array.isArray(insertedRows)) {
          return uploadFailedResult(skipped, validRows.length, errors);
        }

        const inserted = insertedRows.length;
        const duplicateCount = validRows.length - inserted;

        return {
          inserted,
          skipped: skipped + duplicateCount,
          errors: [
            ...errors,
            ...Array.from({ length: duplicateCount }, (_, index) => ({
              code: "duplicate" as const,
              source: "database" as const,
              row: validRows[inserted + index]?.sourceRow,
              reason: "Activity already exists for this date, type, and distance.",
            })),
          ],
        };
      } catch {
        return uploadFailedResult(skipped, validRows.length, errors);
      } finally {
        clearTimeout(timeoutId);
      }
    },

    async getActivities() {
      return fetchSupabaseActivities("select=*&order=activity_date.asc");
    },

    async getRecentActivities(options) {
      const now = options.now ?? new Date();
      const since = monthsBefore(now, options.months).toISOString();
      const searchParams = new URLSearchParams({
        select: "*",
        order: "activity_date.asc",
      });
      searchParams.append("activity_date", `gte.${since}`);
      searchParams.append("activity_date", `lte.${now.toISOString()}`);

      return fetchSupabaseActivities(searchParams.toString());
    },
  };
}

let defaultRepository: ActivityRepository | null = null;

export function getActivityRepository(): ActivityRepository {
  if (defaultRepository === null) {
    defaultRepository = hasSupabaseConfig()
      ? createSupabaseActivityRepository()
      : createInMemoryActivityRepository();
  }

  return defaultRepository;
}

export function resetActivityRepositoryForTests(): void {
  defaultRepository = createInMemoryActivityRepository();
}

function hasSupabaseConfig(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

function dedupeKey(activity: ActivityInput): string {
  return [activity.activityDate, activity.activityType, activity.distanceKm].join("|");
}

function sortActivities(activities: Activity[]): Activity[] {
  return [...activities].sort(
    (left, right) =>
      new Date(left.activityDate).getTime() - new Date(right.activityDate).getTime(),
  );
}

function monthsBefore(now: Date, months: number): Date {
  const since = new Date(now);
  since.setUTCMonth(since.getUTCMonth() - months);
  return since;
}

async function fetchSupabaseActivities(query: string): Promise<Activity[]> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return [];
  }

  const response = await fetch(`${supabaseUrl}/rest/v1/activities?${query}`, {
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${supabaseAnonKey}`,
    },
  });

  if (!response.ok) {
    throw new Error("Failed to fetch activities from Supabase.");
  }

  const rows: unknown = await response.json();
  const parsedRows = activityRowsSchema.parse(rows);

  return sortActivities(parsedRows.map(fromDatabaseRow));
}

function uploadFailedResult(
  skipped: number,
  failedRows: number,
  errors: ActivityImportError[],
): ActivityImportResult {
  return {
    inserted: 0,
    skipped: skipped + failedRows,
    errors: [
      ...errors,
      {
        code: "upload_failed",
        source: "database",
        reason: SUPABASE_UPLOAD_FAILED_REASON,
      },
    ],
  };
}

function getSupabaseUploadTimeoutMs(): number {
  const rawValue = process.env.SUPABASE_UPLOAD_TIMEOUT_MS;

  if (rawValue === undefined) {
    return DEFAULT_SUPABASE_UPLOAD_TIMEOUT_MS;
  }

  const parsedValue = Number.parseInt(rawValue, 10);
  return Number.isInteger(parsedValue) && parsedValue > 0
    ? parsedValue
    : DEFAULT_SUPABASE_UPLOAD_TIMEOUT_MS;
}

function toDatabaseRow(activity: ActivityInput) {
  return {
    activity_date: activity.activityDate,
    activity_type: activity.activityType,
    distance_km: activity.distanceKm,
    duration_seconds: activity.durationSeconds,
    avg_pace_sec_per_km: activity.avgPaceSecPerKm,
    avg_hr: activity.avgHr,
    max_hr: activity.maxHr,
    calories: activity.calories,
    ascent_m: activity.ascentM,
    vo2max_estimate: activity.vo2maxEstimate,
    raw_csv_row: activity.rawCsvRow,
  };
}

function fromDatabaseRow(row: DatabaseActivityRow): Activity {
  return {
    id: row.id,
    activityDate: row.activity_date,
    activityType: row.activity_type,
    distanceKm: Number(row.distance_km),
    durationSeconds: row.duration_seconds,
    avgPaceSecPerKm: row.avg_pace_sec_per_km,
    avgHr: row.avg_hr,
    maxHr: row.max_hr,
    calories: row.calories,
    ascentM: row.ascent_m,
    vo2maxEstimate: row.vo2max_estimate === null ? null : Number(row.vo2max_estimate),
    rawCsvRow: row.raw_csv_row,
    createdAt: row.created_at,
  };
}
