import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PublicActivity } from "../../lib/activity/types";
import { Dashboard } from "./dashboard";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function activity(overrides: Partial<PublicActivity> = {}): PublicActivity {
  return {
    id: crypto.randomUUID(),
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

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

describe("Dashboard", () => {
  it("shows a loading state while activities are being fetched", () => {
    vi.spyOn(globalThis, "fetch").mockReturnValue(new Promise<Response>(() => {}));

    render(<Dashboard />);

    expect(screen.getByText("Loading dashboard...")).toBeTruthy();
  });

  it("shows a retryable error when activities fail to load", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse({ error: "Unable to load activities." }, { status: 500 }))
      .mockResolvedValueOnce(jsonResponse([]));

    render(<Dashboard />);

    await waitFor(() => {
      expect(screen.getByText("Unable to load dashboard data.")).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: /retry/i }));

    await waitFor(() => {
      expect(screen.getByText("Upload Garmin data to see dashboard trends.")).toBeTruthy();
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("shows a retryable error when activities request times out", async () => {
    const originalSetTimeout = globalThis.setTimeout;
    let dashboardTimeout: (() => void) | undefined;

    vi.spyOn(globalThis, "setTimeout").mockImplementation(
      (handler: (_: void) => void, timeout?: number) => {
        if (timeout === 3_000) {
          dashboardTimeout = () => {
            handler(undefined);
          };

          const placeholderTimeout = originalSetTimeout(() => undefined, 0);
          clearTimeout(placeholderTimeout);
          return placeholderTimeout;
        }

        return originalSetTimeout(handler, timeout);
      },
    );

    vi.spyOn(globalThis, "fetch").mockImplementation((_input, init?: RequestInit) => {
      const signal = init?.signal;

      return new Promise<Response>((_resolve, reject) => {
        signal?.addEventListener("abort", () => {
          reject(new DOMException("The operation was aborted.", "AbortError"));
        });
      });
    });

    render(<Dashboard />);

    await waitFor(() => {
      expect(dashboardTimeout).toBeDefined();
    });
    dashboardTimeout?.();

    await waitFor(() => {
      expect(screen.getByText("Unable to load dashboard data.")).toBeTruthy();
    });
  });

  it("hides activity history by default when no activities exist", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse([]));

    render(<Dashboard />);

    await waitFor(() => {
      expect(screen.getByText("Upload Garmin data to see dashboard trends.")).toBeTruthy();
    });

    expect(screen.getByRole("heading", { name: "Pace vs heart rate" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Aerobic efficiency" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "VO2 max" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Weekly mileage" })).toBeTruthy();
    expect(screen.getAllByText("Not enough data yet.").length).toBeGreaterThanOrEqual(3);
    expect(screen.queryByRole("button", { name: "Show activity history" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Activity history" })).toBeNull();
    expect(screen.queryByText("No activities uploaded yet.")).toBeNull();
  });

  it("renders activity history when requested", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse([]));

    render(<Dashboard showActivityHistory />);

    await waitFor(() => {
      expect(screen.getByText("Upload Garmin data to see dashboard trends.")).toBeTruthy();
    });

    expect(screen.queryByRole("button", { name: "Show activity history" })).toBeNull();
    expect(screen.getByRole("region", { name: "Activity history" })).toBeTruthy();
    expect(screen.getByText("No activities uploaded yet.")).toBeTruthy();
  });

  it(
    "renders chart panels while keeping uploaded activity rows collapsed until expanded",
    async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        jsonResponse([
          activity({
            activityDate: "2026-05-01T08:00:00.000Z",
            avgPaceSecPerKm: 360,
            avgHr: 145,
            vo2maxEstimate: 40,
          }),
          activity({
            activityDate: "2026-05-02T08:00:00.000Z",
            avgPaceSecPerKm: 365,
            avgHr: 146,
            vo2maxEstimate: 41,
          }),
          activity({
            activityDate: "2026-05-03T08:00:00.000Z",
            avgPaceSecPerKm: 370,
            avgHr: 147,
            vo2maxEstimate: 42,
          }),
          activity({
            activityDate: "2026-05-04T08:00:00.000Z",
            avgPaceSecPerKm: 375,
            avgHr: 148,
            vo2maxEstimate: 43,
          }),
          activity({
            activityDate: "2026-05-05T08:00:00.000Z",
            avgPaceSecPerKm: 380,
            avgHr: 149,
            vo2maxEstimate: 44,
          }),
          activity({
            activityDate: "2026-05-06T08:00:00.000Z",
            avgPaceSecPerKm: 385,
            avgHr: 150,
            vo2maxEstimate: 45,
          }),
          activity({
            activityDate: "2026-05-07T08:00:00.000Z",
            avgPaceSecPerKm: 390,
            avgHr: 151,
            vo2maxEstimate: 46,
          }),
          activity({
            activityDate: "2026-05-08T08:00:00.000Z",
            activityType: "Cycling",
            distanceKm: 24,
            avgPaceSecPerKm: null,
            avgHr: null,
            vo2maxEstimate: null,
            efficiency: null,
          }),
        ]),
      );

      render(<Dashboard />);

      await waitFor(() => {
        expect(screen.getByTestId("pace-heart-rate-chart")).toBeTruthy();
      });

      expect(screen.getByText("Pace (min/km)")).toBeTruthy();
      expect(screen.getByText("Heart rate (bpm)")).toBeTruthy();
      expect(screen.getByText("Efficiency")).toBeTruthy();
      expect(screen.getByText("VO2 max")).toBeTruthy();
      expect(screen.getByText("Distance (km)")).toBeTruthy();
      expect(screen.queryByRole("button", { name: "Show activity history" })).toBeNull();
      expect(screen.queryByText("Cycling")).toBeNull();
    },
    10_000,
  );

  it("renders uploaded activity rows when history is requested", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse([
        activity({
          activityDate: "2026-05-01T08:00:00.000Z",
          avgPaceSecPerKm: 360,
          avgHr: 145,
          vo2maxEstimate: 40,
        }),
        activity({
          activityDate: "2026-05-08T08:00:00.000Z",
          activityType: "Cycling",
          distanceKm: 24,
          avgPaceSecPerKm: null,
          avgHr: null,
          vo2maxEstimate: null,
          efficiency: null,
        }),
      ]),
    );

    render(<Dashboard showActivityHistory />);

    await waitFor(() => {
      expect(screen.getByRole("region", { name: "Activity history" })).toBeTruthy();
    });

    expect(screen.getByText("Cycling")).toBeTruthy();
    expect(screen.getByText("24.0 km")).toBeTruthy();
    expect(screen.getByText("--")).toBeTruthy();
  });

  it("refetches activities when the refresh key changes", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(jsonResponse([activity()]));

    const { rerender } = render(<Dashboard refreshKey={0} />);

    await waitFor(() => {
      expect(screen.getByText("Upload Garmin data to see dashboard trends.")).toBeTruthy();
    });

    rerender(<Dashboard refreshKey={1} />);

    await waitFor(() => {
      expect(screen.getByText("Trends from 1 uploaded activities.")).toBeTruthy();
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
