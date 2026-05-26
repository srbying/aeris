import { expect, test } from "playwright/test";
import { dashboardActivities, mockActivities, mockChatStream } from "./helpers/fixtures";

test("sends a chat question and renders mocked streamed response", async ({ page }) => {
  await mockActivities(page, dashboardActivities);
  await mockChatStream(
    page,
    "In the mocked fixture, April total was 42.0 miles.",
  );

  await page.goto("/");

  await page.getByLabel("Message").fill("How many miles did I run in April?");
  await page.getByRole("button", { name: "Send" }).click();

  await expect(page.getByText("How many miles did I run in April?")).toBeVisible();
  await expect(page.getByText("April total was 42.0 miles")).toBeVisible();
  await expect(page.getByRole("article", { name: "You turn" })).toBeVisible();
  await expect(page.getByRole("article", { name: "Aeris turn" })).toBeVisible();
  await expect(page.getByLabel("Message")).toBeEnabled();
  await page.getByLabel("Message").fill("Follow up?");
  await expect(page.getByRole("button", { name: "Send" })).toBeEnabled();
});

test("keeps the private thread readable on a mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockActivities(page, dashboardActivities);
  await mockChatStream(
    page,
    "In the mocked fixture, April total was 42.0 miles.",
  );

  await page.goto("/");

  await page.getByLabel("Message").fill("How many miles did I run in April?");
  await page.getByRole("button", { name: "Send" }).click();

  await expect(page.getByText("How many miles did I run in April?")).toBeVisible();
  await expect(page.getByText("April total was 42.0 miles")).toBeVisible();

  const chatWindow = page.getByRole("region", { name: /aeris chat window/i });

  await expect(chatWindow).toBeVisible();
  await expect.poll(async () =>
    chatWindow.evaluate((element) => element.scrollWidth <= element.clientWidth),
  ).toBe(true);
});
