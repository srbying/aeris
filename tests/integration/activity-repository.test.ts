import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createInMemoryActivityRepository,
  createSupabaseActivityRepository,
} from "../../src/lib/activity/activity-repository";
import type { ActivityInput } from "../../src/lib/activity/types";

const originalSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const originalSupabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const originalSupabaseUploadTimeoutMs = process.env.SUPABASE_UPLOAD_TIMEOUT_MS;

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
  delete process.env.SUPABASE_UPLOAD_TIMEOUT_MS;
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();

  if (originalSupabaseUrl === undefined) {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  } else {
    process.env.NEXT_PUBLIC_SUPABASE_URL = originalSupabaseUrl;
  }

  if (originalSupabaseAnonKey === undefined) {
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  } else {
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalSupabaseAnonKey;
  }

  if (originalSupabaseUploadTimeoutMs === undefined) {
    delete process.env.SUPABASE_UPLOAD_TIMEOUT_MS;
  } else {
    process.env.SUPABASE_UPLOAD_TIMEOUT_MS = originalSupabaseUploadTimeoutMs;
  }
});

function activity(overrides: Partial<ActivityInput> = {}): ActivityInput {
  return {
    activityDate: "2026-05-17T08:12:48.000Z",
    activityType: "Running",
    distanceKm: 11.104,
    durationSeconds: 4804,
    avgPaceSecPerKm: 433,
    avgHr: 148,
    maxHr: 172,
    calories: 1233,
    ascentM: 27,
    vo2maxEstimate: 49,
    rawCsvRow: {
      "Activity Type": "Running",
      Date: "2026-05-17 08:12:48",
    },
    ...overrides,
  };
}

describe("activity repository insert flow", () => {
  it("inserts all-new activities", async () => {
    const repository = createInMemoryActivityRepository();

    const result = await repository.insertActivities([
      activity(),
      activity({
        activityDate: "2026-05-18T08:12:48.000Z",
        distanceKm: 6.437,
      }),
    ]);

    expect(result).toEqual({
      inserted: 2,
      skipped: 0,
      errors: [],
    });
  });

  it("counts duplicate re-upload rows as skipped", async () => {
    const repository = createInMemoryActivityRepository();
    await repository.insertActivities([activity()]);

    const result = await repository.insertActivities([activity()]);

    expect(result.inserted).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.errors[0]).toMatchObject({
      code: "duplicate",
      source: "database",
    });
  });

  it("distinguishes duplicate skips from validation skips in mixed uploads", async () => {
    const repository = createInMemoryActivityRepository();
    await repository.insertActivities([activity()]);

    const result = await repository.insertActivities([
      activity(),
      activity({
        activityDate: "2026-05-19T08:12:48.000Z",
        distanceKm: 8.047,
      }),
      {
        ...activity({
          activityDate: "2026-05-20T08:12:48.000Z",
        }),
        durationSeconds: -1,
      } as ActivityInput,
    ]);

    expect(result.inserted).toBe(1);
    expect(result.skipped).toBe(2);
    expect(result.errors.map((error) => error.code).sort()).toEqual([
      "duplicate",
      "validation",
    ]);
  });

  it("counts valid rows as skipped when Supabase fetch fails", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network unavailable"));
    const repository = createSupabaseActivityRepository();

    const result = await repository.insertActivities([
      activity(),
      activity({
        activityDate: "2026-05-18T08:12:48.000Z",
        distanceKm: 6.437,
      }),
    ]);

    expect(result.inserted).toBe(0);
    expect(result.skipped).toBe(2);
    expect(result.errors).toEqual([
      {
        code: "upload_failed",
        source: "database",
        reason: "Supabase upload failed. Try again after checking the database connection.",
      },
    ]);
  });

  it("counts valid rows as skipped when Supabase returns invalid JSON", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("not json", {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const repository = createSupabaseActivityRepository();

    const result = await repository.insertActivities([activity()]);

    expect(result.inserted).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.errors[0]).toMatchObject({
      code: "upload_failed",
      source: "database",
    });
  });

  it("reports Supabase duplicate errors with original input row numbers", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify([{}]), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const repository = createSupabaseActivityRepository();

    const result = await repository.insertActivities([
      {
        ...activity(),
        durationSeconds: -1,
      } as ActivityInput,
      activity({
        activityDate: "2026-05-18T08:12:48.000Z",
        distanceKm: 6.437,
      }),
      activity({
        activityDate: "2026-05-19T08:12:48.000Z",
        distanceKm: 8.047,
      }),
    ]);

    expect(result.inserted).toBe(1);
    expect(result.skipped).toBe(2);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "validation",
          row: 1,
        }),
        expect.objectContaining({
          code: "duplicate",
          row: 3,
        }),
      ]),
    );
  });

  it("aborts Supabase uploads after the configured timeout", async () => {
    vi.useFakeTimers();
    process.env.SUPABASE_UPLOAD_TIMEOUT_MS = "25";
    const repository = createSupabaseActivityRepository();
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("Upload timed out", "AbortError"));
          });
        }),
    );

    const resultPromise = repository.insertActivities([activity()]);

    await vi.advanceTimersByTimeAsync(25);
    const result = await resultPromise;

    expect(fetchSpy).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(result.inserted).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.errors[0]).toMatchObject({
      code: "upload_failed",
      source: "database",
    });
  });

  it("bounds Supabase recent activity queries by both start and end dates", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify([]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const repository = createSupabaseActivityRepository();

    await repository.getRecentActivities({
      months: 3,
      now: new Date("2026-05-25T12:00:00.000Z"),
    });

    const requestUrl = new URL(String(fetchSpy.mock.calls[0][0]));
    expect(requestUrl.searchParams.getAll("activity_date")).toEqual([
      "gte.2026-02-25T12:00:00.000Z",
      "lte.2026-05-25T12:00:00.000Z",
    ]);
  });

  it("rejects invalid Supabase activity row shapes before mapping", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify([{ id: "activity-1", distance_km: "not-a-number" }]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const repository = createSupabaseActivityRepository();

    await expect(repository.getActivities()).rejects.toThrow();
  });
});
