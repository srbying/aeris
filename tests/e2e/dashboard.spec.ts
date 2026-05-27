import { expect, test } from "playwright/test";
import { dashboardActivities, mockActivities } from "./helpers/fixtures";

test("renders dashboard charts and collapsible activity history from fixture-like data", async ({
  page,
}) => {
  await mockActivities(page, dashboardActivities);

  await page.goto("/");

  await expect(page.getByText("Trends from 8 uploaded activities.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Pace vs heart rate" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "VO2 max" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Weekly mileage" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Show activity history" })).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  await expect(page.getByTestId("pace-heart-rate-chart")).toBeVisible();
  await expect(page.getByTestId("vo2-trend-chart")).toBeVisible();
  await expect(page.getByTestId("weekly-mileage-chart")).toBeVisible();
  await expect(page.getByRole("region", { name: "Import Garmin CSV" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "13.2 km" })).toBeHidden();

  await page.getByRole("button", { name: "Show activity history" }).click();

  await expect(page.getByRole("button", { name: "Hide activity history" })).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  await expect(page.getByRole("cell", { name: "13.2 km" })).toBeVisible();

  await page.reload();

  await expect(page.getByText("Trends from 8 uploaded activities.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Show activity history" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "13.2 km" })).toBeHidden();
});

test("renders empty dashboard state gracefully", async ({ page }) => {
  await mockActivities(page, []);

  await page.goto("/");

  await expect(page.getByText("Upload Garmin data to see dashboard trends.")).toBeVisible();
  await expect(page.getByText("No activities uploaded yet.")).toBeHidden();
  await expect(page.getByText("No mileage data yet.")).toBeVisible();
  await expect(page.getByText("Unable to load dashboard data.")).toBeHidden();

  await page.getByRole("button", { name: "Show activity history" }).click();

  await expect(page.getByText("No activities uploaded yet.")).toBeVisible();
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
