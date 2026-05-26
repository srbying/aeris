import path from "node:path";
import type { Page, Route } from "playwright/test";

export const garminSmallCsvPath = path.join(process.cwd(), "test-fixtures", "garmin-small.csv");

type Activity = {
  id: string;
  activityDate: string;
  activityType: string;
  distanceKm: number;
  durationSeconds: number;
  avgPaceSecPerKm: number | null;
  avgHr: number | null;
  maxHr: number | null;
  calories: number | null;
  ascentM: number | null;
  vo2maxEstimate: number | null;
  rawCsvRow: Record<string, string>;
  createdAt: string;
  efficiency: number | null;
};

export const dashboardActivities: Activity[] = [
  activity("run-1", "2026-05-01T08:00:00.000Z", 8.1, 360, 145, 44),
  activity("run-2", "2026-05-03T08:00:00.000Z", 9.2, 358, 144, 45),
  activity("run-3", "2026-05-05T08:00:00.000Z", 10.3, 355, 143, 46),
  activity("run-4", "2026-05-07T08:00:00.000Z", 8.8, 352, 142, 47),
  activity("run-5", "2026-05-10T08:00:00.000Z", 11.1, 350, 141, 48),
  activity("run-6", "2026-05-12T08:00:00.000Z", 9.7, 348, 140, 49),
  activity("run-7", "2026-05-14T08:00:00.000Z", 12.4, 346, 139, 50),
  activity("run-8", "2026-05-17T08:00:00.000Z", 13.2, 344, 138, 51),
];

export async function mockActivities(page: Page, activities: Activity[]): Promise<void> {
  await page.route("**/api/activities", (route) => {
    return route.fulfill({
      contentType: "application/json",
      json: activities,
      status: 200,
    });
  });
}

export async function mockUploadSequence(page: Page): Promise<void> {
  let uploadCount = 0;

  await page.route("**/api/upload", async (route) => {
    uploadCount += 1;
    await assertFixtureUpload(route);

    return route.fulfill({
      contentType: "application/json",
      json:
        uploadCount === 1
          ? { inserted: 8, skipped: 0, errors: [] }
          : { inserted: 0, skipped: 8, errors: [] },
      status: 200,
    });
  });
}

export async function mockChatStream(page: Page, responseText: string): Promise<void> {
  await page.route("**/api/chat", async (route) => {
    const body = route.request().postDataJSON() as { message?: string };

    if (body.message !== "How many miles did I run in April versus March?") {
      return route.fulfill({
        contentType: "application/json",
        json: { error: "Unexpected test message." },
        status: 400,
      });
    }

    return route.fulfill({
      body: `data: ${JSON.stringify({ delta: responseText })}\n\ndata: ${JSON.stringify({ done: true })}\n\n`,
      contentType: "text/event-stream",
      status: 200,
    });
  });
}

function activity(
  id: string,
  activityDate: string,
  distanceKm: number,
  avgPaceSecPerKm: number,
  avgHr: number,
  vo2maxEstimate: number,
): Activity {
  const speedMetersPerSecond = (distanceKm * 1000) / 3600;

  return {
    id,
    activityDate,
    activityType: "Running",
    distanceKm,
    durationSeconds: 3600,
    avgPaceSecPerKm,
    avgHr,
    maxHr: avgHr + 20,
    calories: 700,
    ascentM: 40,
    vo2maxEstimate,
    rawCsvRow: {},
    createdAt: activityDate,
    efficiency: speedMetersPerSecond / avgHr,
  };
}

async function assertFixtureUpload(route: Route): Promise<void> {
  const body = route.request().postDataBuffer();

  if (!body?.includes(Buffer.from("garmin-small.csv"))) {
    throw new Error("Expected upload to include garmin-small.csv fixture.");
  }
}
