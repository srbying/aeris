// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  parseGarminCsv: vi.fn(),
  insertActivities: vi.fn(),
}));

vi.mock("../../src/lib/activity/garmin-parser", () => ({
  parseGarminCsv: mocks.parseGarminCsv,
}));

vi.mock("../../src/lib/activity/activity-repository", () => ({
  getActivityRepository: () => ({
    insertActivities: mocks.insertActivities,
  }),
}));

import { POST } from "../../src/app/api/upload/route";

function uploadRequest(): Request {
  const formData = new FormData();
  formData.set("file", new File(["csv"], "garmin.csv", { type: "text/csv" }));

  return new Request("http://aeris.test/api/upload", {
    method: "POST",
    body: formData,
  });
}

beforeEach(() => {
  mocks.parseGarminCsv.mockReset();
  mocks.insertActivities.mockReset();
});

describe("POST /api/upload review feedback", () => {
  it("returns a clear bad request when an unrecognized CSV has no parser reason", async () => {
    mocks.parseGarminCsv.mockReturnValue({
      isRecognized: false,
      activities: [],
      skipped: [],
    });

    const response = await POST(uploadRequest());
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Unrecognized CSV format.");
  });

  it("rejects malformed upload summary responses before returning JSON", async () => {
    mocks.parseGarminCsv.mockReturnValue({
      isRecognized: true,
      activities: [],
      skipped: [],
    });
    mocks.insertActivities.mockResolvedValue({
      inserted: "two",
      skipped: 0,
      errors: [],
    });

    const response = await POST(uploadRequest());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe("Upload response validation failed.");
  });
});
