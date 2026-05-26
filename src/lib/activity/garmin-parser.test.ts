import { describe, expect, it } from "vitest";
import {
  FEET_TO_METERS,
  MILES_TO_KM,
  parseGarminCsv,
} from "./garmin-parser";

const header = [
  "Activity Type",
  "Date",
  "Title",
  "Distance",
  "Calories",
  "Time",
  "Avg HR",
  "Max HR",
  "Avg Pace",
  "Best Pace",
  "Total Ascent",
  "Total Descent",
  "VO2 Max",
].join(",");

describe("parseGarminCsv", () => {
  it("maps Garmin CSV fields into canonical activity input fields", () => {
    const csv = `${header}
Running,2026-05-17 08:12:48,"Avon Lake - Long Run","6.90","1,233","01:20:04","148","172","11:36","8:04","89","82","49"`;

    const result = parseGarminCsv(csv);

    expect(result.isRecognized).toBe(true);
    expect(result.skipped).toEqual([]);
    expect(result.activities).toHaveLength(1);
    expect(result.activities[0]).toMatchObject({
      activityDate: "2026-05-17T08:12:48.000Z",
      activityType: "Running",
      durationSeconds: 4804,
      avgPaceSecPerKm: 433,
      avgHr: 148,
      maxHr: 172,
      calories: 1233,
      ascentM: 27,
      vo2maxEstimate: 49,
    });
    expect(result.activities[0].distanceKm).toBeCloseTo(6.9 * MILES_TO_KM, 3);
    expect(result.activities[0].ascentM).toBe(Math.round(89 * FEET_TO_METERS));
    expect(result.activities[0].rawCsvRow.Title).toBe("Avon Lake - Long Run");
  });

  it("converts Garmin -- placeholders to null for optional metrics", () => {
    const csv = `${header}
Running,2026-02-14 09:51:58,"Avon Lake Running","3.51","--","00:39:02","--","--","11:08","8:36","--","10","--"`;

    const result = parseGarminCsv(csv);

    expect(result.activities).toHaveLength(1);
    expect(result.activities[0]).toMatchObject({
      avgHr: null,
      maxHr: null,
      calories: null,
      ascentM: null,
      vo2maxEstimate: null,
    });
  });

  it("skips rows missing required date, distance, or duration fields with reasons", () => {
    const csv = `${header}
Running,,"Missing date","3.51","500","00:39:02","140","160","11:08","8:36","10","10","45"
Running,2026-02-14 09:51:58,"Missing distance","--","500","00:39:02","140","160","11:08","8:36","10","10","45"
Running,2026-02-15 09:51:58,"Missing duration","3.51","500","--","140","160","11:08","8:36","10","10","45"`;

    const result = parseGarminCsv(csv);

    expect(result.activities).toEqual([]);
    expect(result.skipped).toHaveLength(3);
    expect(result.skipped.map((skip) => skip.reason).join(" ")).toMatch(/activityDate/);
    expect(result.skipped.map((skip) => skip.reason).join(" ")).toMatch(/distanceKm/);
    expect(result.skipped.map((skip) => skip.reason).join(" ")).toMatch(/durationSeconds/);
  });

  it("marks non-Garmin CSV shapes as unrecognized", () => {
    const result = parseGarminCsv("Name,Value\nSteven,42");

    expect(result.isRecognized).toBe(false);
    expect(result.activities).toEqual([]);
    expect(result.skipped[0].reason).toMatch(/Garmin/);
  });
});
