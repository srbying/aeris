import { expect, test } from "playwright/test";
import {
  garminSmallCsvPath,
  mockActivities,
  mockDemoAllowanceStatus,
  mockUploadSequence,
} from "./helpers/fixtures";

const ownerUploadMessage =
  "Only the runner owner can upload Garmin workouts. Public demo visitors can explore the existing data but cannot add workouts.";

test("uploads Garmin CSV and reports duplicates on re-upload", async ({ page }) => {
  await mockActivities(page, []);
  await mockDemoAllowanceStatus(page, { access: "runner_owner" });
  await mockUploadSequence(page);

  await page.goto("/");

  await page.getByRole("tab", { name: "Import CSV" }).click();
  await expect(page.locator('input[type="file"]')).toBeVisible();
  await page.locator('input[type="file"]').setInputFiles(garminSmallCsvPath);
  await page.getByRole("button", { name: "Upload CSV" }).click();

  await expect(page.getByText("8 runs added, 0 already existed.")).toBeVisible();

  await page.getByRole("button", { name: "Upload CSV" }).click();

  await expect(page.getByText("0 runs added, 8 already existed.")).toBeVisible();
});

test("shows public demo visitors that uploads are owner-only", async ({ page }) => {
  let uploadRequests = 0;
  await mockActivities(page, []);
  await mockDemoAllowanceStatus(page);
  await page.route("**/api/upload", async (route) => {
    uploadRequests += 1;
    await route.fulfill({
      contentType: "application/json",
      json: { error: "Unexpected upload request." },
      status: 500,
    });
  });

  await page.goto("/");

  await page.getByRole("tab", { name: "Import CSV" }).click();

  await expect(page.getByText(ownerUploadMessage)).toBeVisible();
  await expect(page.locator('input[type="file"]')).toHaveCount(0);
  expect(uploadRequests).toBe(0);
});
