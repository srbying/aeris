import { activityInputSchema } from "./schema";
import type { ActivityImportError, ActivityImportResult, ActivityInput } from "./types";

export type ActivityRepository = {
  insertActivities(rows: ActivityInput[]): Promise<ActivityImportResult>;
};

type StoredActivity = ActivityInput & {
  id: string;
  createdAt: string;
};

export function createInMemoryActivityRepository(): ActivityRepository {
  const activities = new Map<string, StoredActivity>();

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
  };
}

export function createSupabaseActivityRepository(): ActivityRepository {
  return {
    async insertActivities(rows) {
      const validRows: ActivityInput[] = [];
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

        validRows.push(parsed.data);
      });

      if (validRows.length === 0) {
        return { inserted: 0, skipped, errors };
      }

      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      if (!supabaseUrl || !supabaseAnonKey) {
        const memoryResult = await createInMemoryActivityRepository().insertActivities(validRows);
        return {
          inserted: memoryResult.inserted,
          skipped: skipped + memoryResult.skipped,
          errors: [...errors, ...memoryResult.errors],
        };
      }

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
          body: JSON.stringify(validRows.map(toDatabaseRow)),
        },
      );

      if (!response.ok) {
        return {
          inserted: 0,
          skipped: skipped + validRows.length,
          errors: [
            ...errors,
            {
              code: "upload_failed",
              source: "database",
              reason: "Supabase upload failed. Try again after checking the database connection.",
            },
          ],
        };
      }

      const insertedRows = (await response.json()) as unknown[];
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
            row: index + 1,
            reason: "Activity already exists for this date, type, and distance.",
          })),
        ],
      };
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
