import { z } from "zod";

const nullableNonNegativeInteger = z.number().int().nonnegative().nullable();
const nullableNonNegativeNumber = z.number().nonnegative().nullable();

export const activityInputSchema = z
  .object({
    activityDate: z.string().refine((value) => !Number.isNaN(Date.parse(value)), {
      message: "activityDate must be a valid ISO date",
    }),
    activityType: z.string().trim().min(1),
    distanceKm: z.number().positive(),
    durationSeconds: z.number().int().positive(),
    avgPaceSecPerKm: nullableNonNegativeInteger,
    avgHr: nullableNonNegativeInteger,
    maxHr: nullableNonNegativeInteger,
    calories: nullableNonNegativeInteger,
    ascentM: nullableNonNegativeInteger,
    vo2maxEstimate: nullableNonNegativeNumber,
    rawCsvRow: z.record(z.string(), z.string()),
  })
  .strict();

export const activityImportResultSchema = z.object({
  inserted: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  errors: z.array(
    z.object({
      code: z.enum(["duplicate", "validation", "unrecognized_csv", "upload_failed"]),
      source: z.enum(["parser", "validation", "database", "upload"]),
      reason: z.string().min(1),
      row: z.number().int().positive().optional(),
    }),
  ),
});

export const uploadResponseSchema = activityImportResultSchema;
