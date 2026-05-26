import { expect, test } from "playwright/test";
import { dashboardActivities, mockActivities } from "./helpers/fixtures";

test("renders dashboard charts and recent runs from fixture-like data", async ({ page }) => {
  await mockActivities(page, dashboardActivities);

  await page.goto("/");

  await expect(page.getByText("Trends from 8 uploaded activities.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Pace vs heart rate" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "VO2 max" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Weekly mileage" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Recent activities" })).toBeVisible();
  await expect(page.getByTestId("pace-heart-rate-chart")).toBeVisible();
  await expect(page.getByTestId("vo2-trend-chart")).toBeVisible();
  await expect(page.getByTestId("weekly-mileage-chart")).toBeVisible();
  await expect(page.getByRole("cell", { name: "13.2 km" })).toBeVisible();
});

test("renders empty dashboard state gracefully", async ({ page }) => {
  await mockActivities(page, []);

  await page.goto("/");

  await expect(page.getByText("Upload Garmin data to see dashboard trends.")).toBeVisible();
  await expect(page.getByText("No activities uploaded yet.")).toBeVisible();
  await expect(page.getByText("No mileage data yet.")).toBeVisible();
  await expect(page.getByText("Unable to load dashboard data.")).toBeHidden();
});
