import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AerisApp } from "../../src/components/aeris-app";
import type { PublicActivity } from "../../src/lib/activity/types";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

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

describe("AerisApp", () => {
  it("refreshes the dashboard after a successful CSV upload without a page reload", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(jsonResponse({ inserted: 1, skipped: 0, errors: [] }))
      .mockResolvedValueOnce(jsonResponse([activity()]));

    const { container } = render(<AerisApp />);

    await waitFor(() => {
      expect(screen.getByText("Upload Garmin data to see dashboard trends.")).toBeTruthy();
    });

    const fileInput = container.querySelector('input[type="file"]');
    fireEvent.change(fileInput as HTMLInputElement, {
      target: {
        files: [new File(["Activity Type,Date\nRunning,2026-05-17"], "garmin.csv")],
      },
    });
    fireEvent.click(screen.getByRole("button", { name: /upload/i }));

    await waitFor(() => {
      expect(screen.getByText("1 runs added, 0 already existed.")).toBeTruthy();
      expect(screen.getByText("Trends from 1 uploaded activities.")).toBeTruthy();
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls.map(([input]) => String(input))).toEqual([
      "/api/activities",
      "/api/upload",
      "/api/activities",
    ]);
  });
});
