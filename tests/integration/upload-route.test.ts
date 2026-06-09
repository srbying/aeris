// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "../../src/app/api/upload/route";
import { resetActivityRepositoryForTests } from "../../src/lib/activity/activity-repository";
import { OWNER_UPLOAD_FORBIDDEN_MESSAGE } from "../../src/lib/activity/upload-messages";
import {
  hashRunnerOwnerAccessToken,
  RUNNER_OWNER_ACCESS_COOKIE_NAME,
} from "../../src/lib/runner-owner/owner-access";

const garminCsv = `Activity Type,Date,Title,Distance,Calories,Time,Avg HR,Max HR,Avg Pace,Best Pace,Total Ascent,Total Descent,VO2 Max
Running,2026-05-17 08:12:48,"Avon Lake - Long Run","6.90","1,233","01:20:04","148","172","11:36","8:04","89","82","49"
Running,2026-05-18 08:12:48,"Easy Run","4.00","700","00:41:00","142","165","10:15","8:50","40","38","48"`;
const ownerToken = "owner-token";

function uploadRequest(file: File, cookie?: string): Request {
  const formData = new FormData();
  formData.set("file", file);
  return new Request("http://aeris.test/api/upload", {
    method: "POST",
    headers: cookie ? { Cookie: cookie } : undefined,
    body: formData,
  });
}

async function postCsv(csv: string): Promise<Response> {
  return POST(
    uploadRequest(new File([csv], "garmin.csv", { type: "text/csv" }), await ownerCookie()),
  );
}

async function ownerCookie(): Promise<string> {
  vi.stubEnv("RUNNER_OWNER_ACCESS_TOKEN", ownerToken);
  return `${RUNNER_OWNER_ACCESS_COOKIE_NAME}=${await hashRunnerOwnerAccessToken(ownerToken)}`;
}

beforeEach(() => {
  resetActivityRepositoryForTests();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("POST /api/upload", () => {
  it("rejects anonymous demo uploads before accepting Garmin data", async () => {
    const response = await POST(
      uploadRequest(new File([garminCsv], "garmin.csv", { type: "text/csv" })),
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toEqual({ error: OWNER_UPLOAD_FORBIDDEN_MESSAGE });
  });

  it("accepts a Garmin CSV file and returns inserted row counts", async () => {
    const response = await postCsv(garminCsv);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      inserted: 2,
      skipped: 0,
      errors: [],
    });
  });

  it("deduplicates rows when the same Garmin CSV is uploaded twice", async () => {
    await postCsv(garminCsv);

    const response = await postCsv(garminCsv);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.inserted).toBe(0);
    expect(body.skipped).toBe(2);
    expect(body.errors.every((error: { code: string }) => error.code === "duplicate")).toBe(true);
  });

  it("rejects unrecognized CSV files with a clear Garmin export error", async () => {
    const response = await postCsv("Name,Value\nSteven,42");
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/Garmin/);
  });

  it("rejects files over 10MB before parsing", async () => {
    const oversized = new File([new Uint8Array(10 * 1024 * 1024 + 1)], "garmin.csv", {
      type: "text/csv",
    });

    const response = await POST(uploadRequest(oversized, await ownerCookie()));
    const body = await response.json();

    expect(response.status).toBe(413);
    expect(body.error).toMatch(/10MB/);
  });

  it("returns a retryable service error when Supabase insert fails", async () => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ message: "database unavailable" }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const { POST: postWithSupabaseEnv } = await import("../../src/app/api/upload/route");
    vi.stubEnv("RUNNER_OWNER_ACCESS_TOKEN", ownerToken);
    const response = await postWithSupabaseEnv(
      uploadRequest(new File([garminCsv], "garmin.csv"), await ownerCookie()),
    );
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.error).toBe(
      "Supabase upload failed. Try again after checking the database connection.",
    );
    expect(body.errors).toEqual([
      expect.objectContaining({
        code: "upload_failed",
        source: "database",
      }),
    ]);
  });
});
