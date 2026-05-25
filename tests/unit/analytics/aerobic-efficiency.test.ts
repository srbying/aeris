import { describe, expect, it } from "vitest";
import type { Activity } from "../../../src/lib/activity/types";
import { calculateAerobicEfficiency } from "../../../src/lib/calculations/efficiency";

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

describe("calculateAerobicEfficiency", () => {
  it("calculates speed meters per second divided by average heart rate", () => {
    expect(calculateAerobicEfficiency(activity())).toBeCloseTo(0.0192, 4);
  });

  it("returns null for activities outside the running efficiency eligibility rules", () => {
    expect(calculateAerobicEfficiency(activity({ activityType: "Cycling" }))).toBeNull();
    expect(calculateAerobicEfficiency(activity({ distanceKm: 2.9 }))).toBeNull();
    expect(calculateAerobicEfficiency(activity({ durationSeconds: 899 }))).toBeNull();
    expect(calculateAerobicEfficiency(activity({ avgHr: null }))).toBeNull();
    expect(calculateAerobicEfficiency(activity({ avgHr: 119 }))).toBeNull();
    expect(calculateAerobicEfficiency(activity({ avgHr: 186 }))).toBeNull();
  });
});
