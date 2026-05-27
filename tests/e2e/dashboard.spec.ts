import { expect, test, type Page } from "playwright/test";
import { dashboardActivities, mockActivities } from "./helpers/fixtures";

type ChartRect = {
  height: number;
  left: number;
  top: number;
  width: number;
};

function rowCounts(rects: ChartRect[]): number[] {
  return rects
    .reduce<ChartRect[][]>((rows, rect) => {
      const row = rows.find((candidate) => Math.abs(candidate[0].top - rect.top) <= 4);

      if (row) {
        row.push(rect);
      } else {
        rows.push([rect]);
      }

      return rows;
    }, [])
    .sort((first, second) => first[0].top - second[0].top)
    .map((row) => row.length);
}

async function chartCardRects(page: Page): Promise<ChartRect[]> {
  return page.getByTestId("chart-card").evaluateAll((cards) =>
    cards.map((card) => {
      const rect = card.getBoundingClientRect();

      return {
        height: rect.height,
        left: rect.left,
        top: rect.top,
        width: rect.width,
      };
    }),
  );
}

test("renders default activity history tab and trend evidence from fixture-like data", async ({
  page,
}) => {
  await mockActivities(page, dashboardActivities);

  await page.goto("/");

  await expect(page.getByRole("tab", { name: "Activity history" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.getByRole("cell", { name: "13.2 km" })).toBeVisible();
  await expect(page.getByText("Trends from 8 uploaded activities.")).toBeHidden();
  await expect(page.getByTestId("pace-heart-rate-chart")).toBeHidden();
  await expect(page.getByRole("region", { name: "Import Garmin CSV" })).toBeHidden();

  await page.getByRole("tab", { name: "Trend evidence" }).click();

  await expect(page.getByRole("tab", { name: "Trend evidence" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.getByText("Trends from 8 uploaded activities.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Pace vs heart rate" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "VO2 max" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Weekly mileage" })).toBeVisible();
  await expect(page.getByTestId("pace-heart-rate-chart")).toBeVisible();
  await expect(page.getByTestId("vo2-trend-chart")).toBeVisible();
  await expect(page.getByTestId("weekly-mileage-chart")).toBeVisible();
  await expect(page.getByRole("cell", { name: "13.2 km" })).toBeHidden();

  await page.reload();

  await expect(page.getByRole("tab", { name: "Activity history" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.getByRole("cell", { name: "13.2 km" })).toBeVisible();
  await expect(page.getByText("Trends from 8 uploaded activities.")).toBeHidden();
});

test("renders empty dashboard state gracefully", async ({ page }) => {
  await mockActivities(page, []);

  await page.goto("/");

  await expect(page.getByText("No activities uploaded yet.")).toBeVisible();
  await expect(page.getByText("Upload Garmin data to see dashboard trends.")).toBeHidden();
  await expect(page.getByText("No mileage data yet.")).toBeHidden();
  await expect(page.getByText("Unable to load dashboard data.")).toBeHidden();

  await page.getByRole("tab", { name: "Trend evidence" }).click();

  await expect(page.getByText("Upload Garmin data to see dashboard trends.")).toBeVisible();
  await expect(page.getByText("No mileage data yet.")).toBeVisible();
});

test("shows a user-friendly dashboard error when Supabase is unavailable", async ({ page }) => {
  await page.route("**/api/activities", (route) => {
    return route.fulfill({
      contentType: "application/json",
      json: { error: "Supabase unavailable" },
      status: 503,
    });
  });

  await page.goto("/");

  await expect(page.getByText("Unable to load dashboard data.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
});

test("lays out chart cards responsively", async ({ page }) => {
  await mockActivities(page, dashboardActivities);

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.getByRole("tab", { name: "Trend evidence" }).click();

  await expect(page.getByTestId("chart-card")).toHaveCount(4);

  const desktopRects = await chartCardRects(page);
  expect(rowCounts(desktopRects)).toEqual([2, 2]);
  expect(desktopRects.every((rect) => rect.height >= 220)).toBe(true);

  await page.setViewportSize({ width: 768, height: 900 });

  const tabletRects = await chartCardRects(page);
  expect(rowCounts(tabletRects)).toEqual([2, 2]);

  await page.setViewportSize({ width: 390, height: 844 });

  const mobileRects = await chartCardRects(page);
  expect(rowCounts(mobileRects)).toEqual([1, 1, 1, 1]);
  await expect
    .poll(async () =>
      page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth),
    )
    .toBe(true);
});

test("keeps import UI hidden until triggered", async ({ page }) => {
  await mockActivities(page, []);

  await page.goto("/");

  await expect(page.getByRole("region", { name: "Import Garmin CSV" })).toBeHidden();

  await page.getByRole("tab", { name: "Import CSV" }).click();

  await expect(page.getByRole("region", { name: "Import Garmin CSV" })).toBeVisible();
});
