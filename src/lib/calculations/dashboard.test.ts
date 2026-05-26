import { describe, expect, it } from "vitest";
import type { Activity } from "../activity/types";
import { calculatePaceTrend, calculateVo2Trend } from "./dashboard";

function activity(overrides: Partial<Activity> = {}): Activity {
  return {
    id: "activity-1",
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

describe("calculatePaceTrend", () => {
  it("returns eligible running pace and heart-rate points from the last 90 days in date order", () => {
    const trend = calculatePaceTrend(
      [
        activity({ activityDate: "2026-05-10T08:00:00.000Z", avgPaceSecPerKm: 390, avgHr: 150 }),
        activity({ activityDate: "2026-05-01T08:00:00.000Z", avgPaceSecPerKm: 360, avgHr: 145 }),
        activity({
          activityDate: "2026-05-12T08:00:00.000Z",
          activityType: "Cycling",
          avgPaceSecPerKm: 320,
          avgHr: 150,
        }),
        activity({ activityDate: "2026-05-13T08:00:00.000Z", distanceKm: 2.9 }),
        activity({ activityDate: "2026-05-14T08:00:00.000Z", avgHr: 119 }),
        activity({ activityDate: "2026-05-15T08:00:00.000Z", avgHr: 186 }),
        activity({ activityDate: "2026-05-16T08:00:00.000Z", avgPaceSecPerKm: null }),
        activity({ activityDate: "2026-02-01T08:00:00.000Z", avgPaceSecPerKm: 330, avgHr: 150 }),
      ],
      { now: new Date("2026-05-25T12:00:00.000Z") },
    );

    expect(trend).toEqual([
      { date: "2026-05-01", paceSecPerKm: 360, avgHr: 145, distanceKm: 10 },
      { date: "2026-05-10", paceSecPerKm: 390, avgHr: 150, distanceKm: 10 },
    ]);
  });
});

describe("calculateVo2Trend", () => {
  it("skips null VO2 values and Garmin sensor outliers while preserving date order", () => {
    const trend = calculateVo2Trend([
      activity({ activityDate: "2026-01-15T08:00:00.000Z", vo2maxEstimate: 47 }),
      activity({ activityDate: "2026-01-01T08:00:00.000Z", vo2maxEstimate: 45 }),
      activity({ activityDate: "2026-01-20T08:00:00.000Z", vo2maxEstimate: null }),
      activity({ activityDate: "2026-01-25T08:00:00.000Z", vo2maxEstimate: 29.9 }),
      activity({ activityDate: "2026-01-26T08:00:00.000Z", vo2maxEstimate: 80.1 }),
      activity({ activityDate: "2026-02-01T08:00:00.000Z", vo2maxEstimate: 48 }),
    ]);

    expect(trend).toEqual({
      hasEnoughData: false,
      points: [
        { date: "2026-01-01", vo2maxEstimate: 45, rollingAverage7: null },
        { date: "2026-01-15", vo2maxEstimate: 47, rollingAverage7: null },
        { date: "2026-02-01", vo2maxEstimate: 48, rollingAverage7: null },
      ],
    });
  });

  it("skips VO2 points with malformed activity dates", () => {
    const trend = calculateVo2Trend([
      activity({ activityDate: "not-a-date", vo2maxEstimate: 50 }),
      activity({ activityDate: "2026-01-01T08:00:00.000Z", vo2maxEstimate: 45 }),
    ]);

    expect(trend).toEqual({
      hasEnoughData: false,
      points: [{ date: "2026-01-01", vo2maxEstimate: 45, rollingAverage7: null }],
    });
  });

  it("adds a seven-run rolling average once enough VO2 points exist", () => {
    const trend = calculateVo2Trend([
      activity({ activityDate: "2026-01-01T08:00:00.000Z", vo2maxEstimate: 40 }),
      activity({ activityDate: "2026-01-02T08:00:00.000Z", vo2maxEstimate: 41 }),
      activity({ activityDate: "2026-01-03T08:00:00.000Z", vo2maxEstimate: 42 }),
      activity({ activityDate: "2026-01-04T08:00:00.000Z", vo2maxEstimate: 43 }),
      activity({ activityDate: "2026-01-05T08:00:00.000Z", vo2maxEstimate: 44 }),
      activity({ activityDate: "2026-01-06T08:00:00.000Z", vo2maxEstimate: 45 }),
      activity({ activityDate: "2026-01-07T08:00:00.000Z", vo2maxEstimate: 46 }),
    ]);

    expect(trend.hasEnoughData).toBe(true);
    expect(trend.points.at(-1)).toEqual({
      date: "2026-01-07",
      vo2maxEstimate: 46,
      rollingAverage7: 43,
    });
  });
});
