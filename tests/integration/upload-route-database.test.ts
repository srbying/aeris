// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const testSupabaseUrl = process.env.SUPABASE_TEST_URL;
const testSupabaseAnonKey = process.env.SUPABASE_TEST_ANON_KEY;
const originalSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const originalSupabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const shouldRunDatabaseTests = Boolean(testSupabaseUrl && testSupabaseAnonKey);

const garminCsv = `Activity Type,Date,Title,Distance,Calories,Time,Avg HR,Max HR,Avg Pace,Best Pace,Total Ascent,Total Descent,VO2 Max
Running,2026-06-01 08:12:48,"Database Test Long Run","6.90","1,233","01:20:04","148","172","11:36","8:04","89","82","49"
Running,2026-06-02 08:12:48,"Database Test Easy Run","4.00","700","00:41:00","142","165","10:15","8:50","40","38","48"`;

function uploadRequest(csv: string): Request {
  const formData = new FormData();
  formData.set("file", new File([csv], "garmin.csv", { type: "text/csv" }));

  return new Request("http://aeris.test/api/upload", {
    method: "POST",
    body: formData,
  });
}

async function postCsv(csv: string): Promise<Response> {
  const { POST } = await import("../../src/app/api/upload/route");
  return POST(uploadRequest(csv));
}

async function clearTestActivities(): Promise<void> {
  if (!testSupabaseUrl || !testSupabaseAnonKey) {
    return;
  }

  const response = await fetch(
    `${testSupabaseUrl}/rest/v1/activities?activity_date=gte.2026-06-01T00:00:00.000Z&activity_date=lt.2026-06-03T00:00:00.000Z`,
    {
      method: "DELETE",
      headers: {
        apikey: testSupabaseAnonKey,
        Authorization: `Bearer ${testSupabaseAnonKey}`,
      },
    },
  );

  if (!response.ok) {
    throw new Error(`Failed to clear upload route test activities: ${response.status}`);
  }
}

describe.skipIf(!shouldRunDatabaseTests)("POST /api/upload with Supabase test database", () => {
  beforeEach(async () => {
    vi.resetModules();
    process.env.NEXT_PUBLIC_SUPABASE_URL = testSupabaseUrl;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = testSupabaseAnonKey;
    await clearTestActivities();
  });

  afterEach(async () => {
    await clearTestActivities();
    vi.resetModules();

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
  });

  it("uploads a Garmin CSV into the test database", async () => {
    const response = await postCsv(garminCsv);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      inserted: 2,
      skipped: 0,
      errors: [],
    });
  });

  it("skips duplicates when the same CSV is uploaded twice", async () => {
    await postCsv(garminCsv);

    const response = await postCsv(garminCsv);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.inserted).toBe(0);
    expect(body.skipped).toBe(2);
    expect(body.errors).toEqual([
      expect.objectContaining({
        code: "duplicate",
        source: "database",
        row: 1,
      }),
      expect.objectContaining({
        code: "duplicate",
        source: "database",
        row: 2,
      }),
    ]);
  });

  it("rejects an invalid upload without writing to the test database", async () => {
    const response = await postCsv("Name,Value\nSteven,42");
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/Garmin/);
  });
});
