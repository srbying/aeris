import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PublicActivity } from "../../lib/activity/types";
import { AerisApp } from "./aeris-app";

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

describe("AerisApp", () => {
  it("presents chat as the primary workspace with chart-backed supporting evidence second", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse([]));

    render(<AerisApp />);

    await waitFor(() => {
      expect(screen.getByRole("region", { name: /aeris conversation/i })).toBeTruthy();
    });

    const primaryWorkspace = screen.getByRole("region", { name: /aeris conversation/i });
    const supportingEvidence = screen.getByRole("complementary", {
      name: /supporting evidence/i,
    });

    expect(primaryWorkspace.compareDocumentPosition(supportingEvidence)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(primaryWorkspace.textContent).toContain("Aeris chat");
    expect(
      within(supportingEvidence).getByRole("heading", { name: "Supporting evidence" }),
    ).toBeTruthy();
    expect(
      within(supportingEvidence).getByRole("heading", { name: "Pace vs heart rate" }),
    ).toBeTruthy();
    expect(
      within(supportingEvidence).getByRole("heading", { name: "Aerobic efficiency" }),
    ).toBeTruthy();
    expect(within(supportingEvidence).getByRole("heading", { name: "VO2 max" })).toBeTruthy();
    expect(
      within(supportingEvidence).getByRole("heading", { name: "Weekly mileage" }),
    ).toBeTruthy();

    const importAction = within(supportingEvidence).getByRole("region", {
      name: /import garmin csv/i,
    });

    expect(within(importAction).getByRole("button", { name: "Upload CSV" })).toBeTruthy();
  });

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

    const fileInput = getFileInput(container);
    fireEvent.change(fileInput, {
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
