// @vitest-environment node

import { beforeEach, describe, expect, it } from "vitest";
import { GET, dynamic } from "../../src/app/api/activities/route";
import {
  getActivityRepository,
  resetActivityRepositoryForTests,
} from "../../src/lib/activity/activity-repository";
import type { ActivityInput } from "../../src/lib/activity/types";

beforeEach(() => {
  resetActivityRepositoryForTests();
});

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
    rawCsvRow: {},
    ...overrides,
  };
}

describe("GET /api/activities", () => {
  it("declares force-dynamic behavior", () => {
    expect(dynamic).toBe("force-dynamic");
  });

  it("returns normalized activities sorted by activity date", async () => {
    await getActivityRepository().insertActivities([
      activity({ activityDate: "2026-05-18T08:12:48.000Z" }),
      activity({ activityDate: "2026-05-17T08:12:48.000Z" }),
    ]);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.map((row: { activityDate: string }) => row.activityDate)).toEqual([
      "2026-05-17T08:12:48.000Z",
      "2026-05-18T08:12:48.000Z",
    ]);
    expect(body[0]).toMatchObject({
      activityType: "Running",
      distanceKm: 11.104,
      efficiency: expect.any(Number),
    });
    expect(body[0]).not.toHaveProperty("activity_date");
  });

  it("preserves nullable public fields", async () => {
    await getActivityRepository().insertActivities([
      activity({
        avgHr: null,
        maxHr: null,
        calories: null,
        ascentM: null,
        vo2maxEstimate: null,
      }),
    ]);

    const response = await GET();
    const body = await response.json();

    expect(body[0]).toMatchObject({
      avgHr: null,
      maxHr: null,
      calories: null,
      ascentM: null,
      vo2maxEstimate: null,
      efficiency: null,
    });
  });
});
