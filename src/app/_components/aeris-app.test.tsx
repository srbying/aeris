import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PublicActivity } from "../../lib/activity/types";
import { AerisApp } from "./aeris-app";

const DEMO_ALLOWANCE_STATUS_URL = "/api/demo-allowance/status";
const ACTIVITIES_URL = "/api/activities";
const UPLOAD_URL = "/api/upload";
const ownerUploadMessage =
  "Only the runner owner can upload Garmin workouts. Public demo visitors can explore the existing data but cannot add workouts.";

type DemoAllowanceStatus = {
  access: "anonymous_demo" | "runner_owner";
  enabled: boolean;
  limit: number;
  remaining: number;
  exhausted: boolean;
  availability: "available" | "unavailable";
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function getFileInput(container: HTMLElement): HTMLInputElement {
  const fileInput = container.querySelector<HTMLInputElement>('input[type="file"]');

  if (!fileInput) {
    throw new Error("file input not found");
  }

  return fileInput;
}

function activity(overrides: Partial<PublicActivity> = {}): PublicActivity {
  return {
    id: "activity-1",
    activityDate: "2026-05-17T08:00:00.000Z",
    activityType: "Running",
    distanceKm: 10,
    durationSeconds: 3600,
    avgPaceSecPerKm: 360,
    avgHr: 145,
    maxHr: 170,
    calories: 700,
    ascentM: 40,
    vo2maxEstimate: 49,
    rawCsvRow: {},
    createdAt: "2026-05-17T09:00:00.000Z",
    efficiency: 0.0192,
    ...overrides,
  };
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function mockAerisAppFetch({
  activityResponses,
  demoAllowanceStatus = {
    access: "anonymous_demo",
    enabled: false,
    limit: 5,
    remaining: 5,
    exhausted: false,
    availability: "available",
  },
  uploadResponse = { inserted: 1, skipped: 0, errors: [] },
}: {
  activityResponses: PublicActivity[][];
  demoAllowanceStatus?: DemoAllowanceStatus;
  uploadResponse?: unknown;
}) {
  let activityResponseIndex = 0;

  return vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
    const url = toFetchUrl(input);

    if (url === DEMO_ALLOWANCE_STATUS_URL) {
      return Promise.resolve(jsonResponse(demoAllowanceStatus));
    }

    if (url === ACTIVITIES_URL) {
      const responseBody =
        activityResponses[activityResponseIndex] ??
        activityResponses[activityResponses.length - 1] ??
        [];
      activityResponseIndex += 1;

      return Promise.resolve(jsonResponse(responseBody));
    }

    if (url === UPLOAD_URL) {
      return Promise.resolve(jsonResponse(uploadResponse));
    }

    return Promise.resolve(
      new Response(JSON.stringify({ error: "Unexpected request." }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }),
    );
  });
}

function nonStatusFetchUrls(fetchMock: { mock: { calls: Parameters<typeof fetch>[] } }): string[] {
  return fetchMock.mock.calls
    .map(([input]) => toFetchUrl(input))
    .filter((url) => url !== DEMO_ALLOWANCE_STATUS_URL);
}

function toFetchUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") {
    return input;
  }

  if (input instanceof Request) {
    return input.url;
  }

  return input.toString();
}

describe("AerisApp", () => {
  it("stacks chat, evidence tabs, the default history panel, and hidden optional panels", async () => {
    mockAerisAppFetch({ activityResponses: [[activity()]] });

    render(<AerisApp />);

    await waitFor(() => {
      expect(screen.getByRole("region", { name: /aeris conversation/i })).toBeTruthy();
    });

    const primaryWorkspace = screen.getByRole("region", { name: /aeris conversation/i });
    const supportingEvidence = screen.getByRole("complementary", {
      name: /supporting evidence/i,
    });
    const evidenceTabs = screen.getByRole("tablist", { name: "Supporting evidence sections" });

    expect(primaryWorkspace.compareDocumentPosition(supportingEvidence)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(primaryWorkspace.className).toContain("max-w-6xl");
    expect(primaryWorkspace.className).toContain("min-h-[280px]");
    expect(primaryWorkspace.className).toContain("h-[78vh]");
    expect(primaryWorkspace.className).toContain("lg:min-h-[620px]");
    expect(supportingEvidence.contains(evidenceTabs)).toBe(true);
    expect(primaryWorkspace.textContent).toContain("Aeris chat");
    expect(
      within(evidenceTabs)
        .getByRole("tab", { name: "Activity history" })
        .getAttribute("aria-selected"),
    ).toBe("true");
    expect(
      within(evidenceTabs)
        .getByRole("tab", { name: "Trend evidence" })
        .getAttribute("aria-selected"),
    ).toBe("false");
    expect(
      within(evidenceTabs)
        .getByRole("tab", { name: "Import CSV" })
        .getAttribute("aria-selected"),
    ).toBe("false");
    expect(screen.getByRole("tabpanel", { name: "Activity history" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Activity history" })).toBeTruthy();
    expect(screen.queryByRole("region", { name: /import garmin csv/i })).toBeNull();
    expect(within(supportingEvidence).queryByRole("heading", { name: "Pace vs heart rate" })).toBeNull();
    expect(within(supportingEvidence).queryByRole("heading", { name: "Aerobic efficiency" })).toBeNull();
    expect(within(supportingEvidence).queryByRole("heading", { name: "VO2 max" })).toBeNull();
    expect(within(supportingEvidence).queryByRole("heading", { name: "Weekly mileage" })).toBeNull();
  });

  it("switches from the default activity history tab to trend evidence", async () => {
    mockAerisAppFetch({ activityResponses: [[activity()]] });

    render(<AerisApp />);

    await waitFor(() => {
      expect(screen.getByText("Last 10 uploaded activities.")).toBeTruthy();
    });

    expect(screen.getByRole("region", { name: "Activity history" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Pace vs heart rate" })).toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: "Trend evidence" }));

    expect(screen.getByRole("tab", { name: "Trend evidence" }).getAttribute("aria-selected")).toBe(
      "true",
    );
    expect(screen.queryByRole("region", { name: "Activity history" })).toBeNull();

    const trendsPanel = screen.getByRole("tabpanel", { name: "Trend evidence" });
    expect(within(trendsPanel).getByRole("heading", { name: "Pace vs heart rate" })).toBeTruthy();
    expect(within(trendsPanel).getByRole("heading", { name: "Aerobic efficiency" })).toBeTruthy();
    expect(within(trendsPanel).getByRole("heading", { name: "VO2 max" })).toBeTruthy();
    expect(within(trendsPanel).getByRole("heading", { name: "Weekly mileage" })).toBeTruthy();
  });

  it("refreshes the dashboard after a successful CSV upload without a page reload", async () => {
    const fetchMock = mockAerisAppFetch({
      activityResponses: [[], [activity()]],
      demoAllowanceStatus: {
        access: "runner_owner",
        enabled: false,
        limit: 5,
        remaining: 5,
        exhausted: false,
        availability: "available",
      },
      uploadResponse: { inserted: 1, skipped: 0, errors: [] },
    });

    const { container } = render(<AerisApp />);

    await waitFor(() => {
      expect(screen.getByText("No activities uploaded yet.")).toBeTruthy();
    });
    expect(screen.queryByRole("region", { name: /import garmin csv/i })).toBeNull();
    expect(screen.queryByText("Upload Garmin data to see dashboard trends.")).toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: "Import CSV" }));

    await waitFor(() => {
      expect(getFileInput(container)).toBeTruthy();
    });

    const fileInput = getFileInput(container);
    fireEvent.change(fileInput, {
      target: {
        files: [new File(["Activity Type,Date\nRunning,2026-05-17"], "garmin.csv")],
      },
    });
    const importAction = screen.getByRole("region", { name: /import garmin csv/i });

    fireEvent.click(within(importAction).getByRole("button", { name: /upload/i }));

    await waitFor(() => {
      expect(screen.getByText("1 runs added, 0 already existed.")).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("tab", { name: "Trend evidence" }));

    await waitFor(() => {
      expect(screen.getByText("Trends from 1 uploaded activities.")).toBeTruthy();
    });
    expect(nonStatusFetchUrls(fetchMock)).toEqual([
      "/api/activities",
      "/api/upload",
      "/api/activities",
    ]);
  });

  it("shows demo visitors why Garmin uploads are disabled", async () => {
    const fetchMock = mockAerisAppFetch({
      activityResponses: [[]],
    });

    const { container } = render(<AerisApp />);

    await waitFor(() => {
      expect(screen.getByText("No activities uploaded yet.")).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("tab", { name: "Import CSV" }));

    expect(screen.getByRole("region", { name: /import garmin csv/i })).toBeTruthy();
    expect(screen.getByText(ownerUploadMessage)).toBeTruthy();
    expect(container.querySelector('input[type="file"]')).toBeNull();
    expect(screen.queryByRole("button", { name: /upload/i })).toBeNull();
    expect(nonStatusFetchUrls(fetchMock)).toEqual(["/api/activities"]);
  });
});
