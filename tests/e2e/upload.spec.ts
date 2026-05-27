import { expect, test } from "playwright/test";
import { garminSmallCsvPath, mockActivities, mockUploadSequence } from "./helpers/fixtures";

test("uploads Garmin CSV and reports duplicates on re-upload", async ({ page }) => {
  await mockActivities(page, []);
  await mockUploadSequence(page);

  await page.goto("/");

  await page.getByRole("tab", { name: "Import CSV" }).click();
  await page.locator('input[type="file"]').setInputFiles(garminSmallCsvPath);
  await page.getByRole("button", { name: "Upload CSV" }).click();

  await expect(page.getByText("8 runs added, 0 already existed.")).toBeVisible();

  await page.getByRole("button", { name: "Upload CSV" }).click();

  await expect(page.getByText("0 runs added, 8 already existed.")).toBeVisible();
});
