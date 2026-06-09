// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
import { OWNER_UPLOAD_FORBIDDEN_MESSAGE } from "../../src/lib/activity/upload-messages";
import {
  hashRunnerOwnerAccessToken,
  RUNNER_OWNER_ACCESS_COOKIE_NAME,
} from "../../src/lib/runner-owner/owner-access";

const ownerToken = "owner-token";

function uploadRequest(cookie?: string): Request {
  const formData = new FormData();
  formData.set("file", new File(["csv"], "garmin.csv", { type: "text/csv" }));

  return new Request("http://aeris.test/api/upload", {
    method: "POST",
    headers: cookie ? { Cookie: cookie } : undefined,
    body: formData,
  });
}

async function ownerCookie(): Promise<string> {
  vi.stubEnv("RUNNER_OWNER_ACCESS_TOKEN", ownerToken);
  return `${RUNNER_OWNER_ACCESS_COOKIE_NAME}=${await hashRunnerOwnerAccessToken(ownerToken)}`;
}

beforeEach(() => {
  mocks.parseGarminCsv.mockReset();
  mocks.insertActivities.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/upload review feedback", () => {
  it("rejects anonymous demo uploads before parsing the file", async () => {
    const response = await POST(uploadRequest());
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toEqual({ error: OWNER_UPLOAD_FORBIDDEN_MESSAGE });
    expect(mocks.parseGarminCsv).not.toHaveBeenCalled();
    expect(mocks.insertActivities).not.toHaveBeenCalled();
  });

  it("returns a clear bad request when an unrecognized CSV has no parser reason", async () => {
    mocks.parseGarminCsv.mockReturnValue({
      isRecognized: false,
      activities: [],
      skipped: [],
    });

    const response = await POST(uploadRequest(await ownerCookie()));
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

    const response = await POST(uploadRequest(await ownerCookie()));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe("Upload response validation failed.");
  });
});
