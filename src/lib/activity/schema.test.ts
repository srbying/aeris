import { afterEach, describe, expect, it } from "vitest";
import { getActivityContextMonths } from "../config/env";
import { activityInputSchema } from "./schema";

const originalContextMonths = process.env.ACTIVITY_CONTEXT_MONTHS;

function validActivityInput() {
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
  };
}

afterEach(() => {
  if (originalContextMonths === undefined) {
    delete process.env.ACTIVITY_CONTEXT_MONTHS;
  } else {
    process.env.ACTIVITY_CONTEXT_MONTHS = originalContextMonths;
  }
});

describe("activity input schema", () => {
  it("accepts a complete canonical activity input", () => {
    const parsed = activityInputSchema.parse(validActivityInput());

    expect(parsed).toEqual(validActivityInput());
  });

  it("allows nullable optional Garmin metrics without coercing them to zero", () => {
    const row = {
      ...validActivityInput(),
      avgHr: null,
      maxHr: null,
      calories: null,
      ascentM: null,
      vo2maxEstimate: null,
    };

    const parsed = activityInputSchema.parse(row);

    expect(parsed.avgHr).toBeNull();
    expect(parsed.maxHr).toBeNull();
    expect(parsed.calories).toBeNull();
    expect(parsed.ascentM).toBeNull();
    expect(parsed.vo2maxEstimate).toBeNull();
  });

  it("rejects rows that are missing required activity fields", () => {
    const result = activityInputSchema.safeParse({
      ...validActivityInput(),
      distanceKm: undefined,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.includes("distanceKm"))).toBe(true);
    }
  });
});

describe("activity environment config", () => {
  it("defaults ACTIVITY_CONTEXT_MONTHS to 12", () => {
    delete process.env.ACTIVITY_CONTEXT_MONTHS;

    expect(getActivityContextMonths()).toBe(12);
  });

  it("rejects invalid ACTIVITY_CONTEXT_MONTHS values", () => {
    process.env.ACTIVITY_CONTEXT_MONTHS = "0";

    expect(() => getActivityContextMonths()).toThrow(/ACTIVITY_CONTEXT_MONTHS/);
  });
});
