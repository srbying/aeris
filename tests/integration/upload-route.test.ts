// @vitest-environment node

import { beforeEach, describe, expect, it } from "vitest";
import { POST } from "../../src/app/api/upload/route";
import { resetActivityRepositoryForTests } from "../../src/lib/activity/activity-repository";

const garminCsv = `Activity Type,Date,Title,Distance,Calories,Time,Avg HR,Max HR,Avg Pace,Best Pace,Total Ascent,Total Descent,VO2 Max
Running,2026-05-17 08:12:48,"Avon Lake - Long Run","6.90","1,233","01:20:04","148","172","11:36","8:04","89","82","49"
Running,2026-05-18 08:12:48,"Easy Run","4.00","700","00:41:00","142","165","10:15","8:50","40","38","48"`;

function uploadRequest(file: File): Request {
  const formData = new FormData();
  formData.set("file", file);
  return new Request("http://aeris.test/api/upload", {
    method: "POST",
    body: formData,
  });
}

async function postCsv(csv: string): Promise<Response> {
  return POST(uploadRequest(new File([csv], "garmin.csv", { type: "text/csv" })));
}

beforeEach(() => {
  resetActivityRepositoryForTests();
});

describe("POST /api/upload", () => {
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

    const response = await POST(uploadRequest(oversized));
    const body = await response.json();

    expect(response.status).toBe(413);
    expect(body.error).toMatch(/10MB/);
  });
});
