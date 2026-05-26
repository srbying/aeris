import { describe, expect, it } from "vitest";
import type { Activity } from "../../../src/lib/activity/types";
import { calculateWeeklyMileage } from "../../../src/lib/calculations/weekly-mileage";

function activity(overrides: Partial<Activity> = {}): Activity {
  return {
    id: crypto.randomUUID(),
    activityDate: "2026-05-17T08:00:00.000Z",
    activityType: "Running",
    distanceKm: 10,
    durationSeconds: 3600,
    avgPaceSecPerKm: 360,
    avgHr: 145,
    maxHr: 170,
    calories: 700,
    ascentM: 40,
    vo2maxEstimate: 49,
    rawCsvRow: {},
    createdAt: "2026-05-17T09:00:00.000Z",
    ...overrides,
  };
}

describe("calculateWeeklyMileage", () => {
  it("aggregates all activity types by ISO week and fills empty weeks with zero", () => {
    const weeklyMileage = calculateWeeklyMileage(
      [
        activity({ activityDate: "2026-05-04T08:00:00.000Z", distanceKm: 5 }),
        activity({
          activityDate: "2026-05-06T08:00:00.000Z",
          activityType: "Cycling",
          distanceKm: 20,
        }),
        activity({ activityDate: "2026-05-18T08:00:00.000Z", distanceKm: 10 }),
        activity({ activityDate: "2026-05-24T08:00:00.000Z", distanceKm: 7 }),
        activity({
          activityDate: "2026-05-25T08:00:00.000Z",
          activityType: "Hiking",
          distanceKm: 3,
        }),
        activity({ activityDate: "2026-04-27T08:00:00.000Z", distanceKm: 99 }),
      ],
      { now: new Date("2026-05-25T12:00:00.000Z"), weeks: 4 },
    );

    expect(weeklyMileage).toEqual([
      { weekStart: "2026-05-04", distanceKm: 25 },
      { weekStart: "2026-05-11", distanceKm: 0 },
      { weekStart: "2026-05-18", distanceKm: 17 },
      { weekStart: "2026-05-25", distanceKm: 3 },
    ]);
  });

  it("falls back to the default week count when weeks is not positive", () => {
    const weeklyMileage = calculateWeeklyMileage([], {
      now: new Date("2026-05-25T12:00:00.000Z"),
      weeks: 0,
    });

    expect(weeklyMileage).toHaveLength(16);
    expect(weeklyMileage.at(0)).toEqual({ weekStart: "2026-02-09", distanceKm: 0 });
    expect(weeklyMileage.at(-1)).toEqual({ weekStart: "2026-05-25", distanceKm: 0 });
  });

  it("floors fractional week counts before building week buckets", () => {
    const weeklyMileage = calculateWeeklyMileage([], {
      now: new Date("2026-05-25T12:00:00.000Z"),
      weeks: 2.8,
    });

    expect(weeklyMileage).toEqual([
      { weekStart: "2026-05-18", distanceKm: 0 },
      { weekStart: "2026-05-25", distanceKm: 0 },
    ]);
  });
});
