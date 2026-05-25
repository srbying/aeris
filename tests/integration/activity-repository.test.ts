import { describe, expect, it } from "vitest";
import {
  createInMemoryActivityRepository,
} from "../../src/lib/activity/activity-repository";
import type { ActivityInput } from "../../src/lib/activity/types";

function activity(overrides: Partial<ActivityInput> = {}): ActivityInput {
  return {
    activityDate: "2026-05-17T08:12:48.000Z",
    activityType: "Running",
    distanceKm: 11.104,
    durationSeconds: 4804,
    avgPaceSecPerKm: 433,
    avgHr: 148,
    maxHr: 172,
    calories: 1233,
    ascentM: 27,
    vo2maxEstimate: 49,
    rawCsvRow: {
      "Activity Type": "Running",
      Date: "2026-05-17 08:12:48",
    },
    ...overrides,
  };
}

describe("activity repository insert flow", () => {
  it("inserts all-new activities", async () => {
    const repository = createInMemoryActivityRepository();

    const result = await repository.insertActivities([
      activity(),
      activity({
        activityDate: "2026-05-18T08:12:48.000Z",
        distanceKm: 6.437,
      }),
    ]);

    expect(result).toEqual({
      inserted: 2,
      skipped: 0,
      errors: [],
    });
  });

  it("counts duplicate re-upload rows as skipped", async () => {
    const repository = createInMemoryActivityRepository();
    await repository.insertActivities([activity()]);

    const result = await repository.insertActivities([activity()]);

    expect(result.inserted).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.errors[0]).toMatchObject({
      code: "duplicate",
      source: "database",
    });
  });

  it("distinguishes duplicate skips from validation skips in mixed uploads", async () => {
    const repository = createInMemoryActivityRepository();
    await repository.insertActivities([activity()]);

    const result = await repository.insertActivities([
      activity(),
      activity({
        activityDate: "2026-05-19T08:12:48.000Z",
        distanceKm: 8.047,
      }),
      {
        ...activity({
          activityDate: "2026-05-20T08:12:48.000Z",
        }),
        durationSeconds: -1,
      } as ActivityInput,
    ]);

    expect(result.inserted).toBe(1);
    expect(result.skipped).toBe(2);
    expect(result.errors.map((error) => error.code).sort()).toEqual([
      "duplicate",
      "validation",
    ]);
  });
});
