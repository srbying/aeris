import { expect, test } from "playwright/test";
import { dashboardActivities, mockActivities, mockChatStream } from "./helpers/fixtures";

test("sends a chat question and renders mocked streamed response", async ({ page }) => {
  await mockActivities(page, dashboardActivities);
  await mockChatStream(
    page,
    "In the mocked fixture, April was 42.0 miles and March was 37.5 miles.",
  );

  await page.goto("/");

  await page.getByLabel("Message").fill("How many miles did I run in April versus March?");
  await page.getByRole("button", { name: "Send" }).click();

  await expect(
    page.getByText("How many miles did I run in April versus March?"),
  ).toBeVisible();
  await expect(page.getByText("April was 42.0 miles and March was 37.5 miles")).toBeVisible();
  await expect(page.getByLabel("Message")).toBeEnabled();
  await page.getByLabel("Message").fill("Follow up?");
  await expect(page.getByRole("button", { name: "Send" })).toBeEnabled();
});
