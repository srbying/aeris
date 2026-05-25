// @vitest-environment node

import { afterEach, describe, expect, it, vi } from "vitest";
import { POST, runtime } from "../../src/app/api/chat/route";
import { resetChatDependenciesForTests, setChatDependenciesForTests } from "../../src/lib/llm/dependencies";
import type { Activity } from "../../src/lib/activity/types";

afterEach(() => {
  resetChatDependenciesForTests();
  vi.restoreAllMocks();
});

function chatRequest(body: unknown): Request {
  return new Request("http://aeris.test/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function activity(overrides: Partial<Activity> = {}): Activity {
  return {
    id: "activity-1",
    activityDate: "2026-05-01T08:00:00.000Z",
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
    createdAt: "2026-05-01T09:00:00.000Z",
    ...overrides,
  };
}

async function readStream(response: Response): Promise<string> {
  const body = await response.text();
  return body.replace(/\r\n/g, "\n");
}

describe("POST /api/chat", () => {
  it("declares the Edge Runtime", () => {
    expect(runtime).toBe("edge");
  });

  it("streams provider deltas as SSE and finishes with a done event", async () => {
    const fakeProvider = {
      id: "fake",
      model: "fake-model",
      stream() {
        return ["hello", " world"];
      },
    };
    const getRecentActivities = vi.fn().mockResolvedValue([activity()]);

    setChatDependenciesForTests({
      provider: fakeProvider,
      repository: {
        getActivities: vi.fn().mockResolvedValue([]),
        getRecentActivities,
        insertActivities: vi.fn(),
      },
    });

    const response = await POST(
      chatRequest({
        message: "Am I getting faster?",
        history: [{ role: "user", content: "Use my running data." }],
      }),
    );
    const body = await readStream(response);

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/event-stream");
    expect(body).toContain('data: {"delta":"hello"}');
    expect(body).toContain('data: {"delta":" world"}');
    expect(body).toContain('data: {"done":true}');
    expect(getRecentActivities).toHaveBeenCalled();
  });

  it("rejects invalid request bodies before calling a provider", async () => {
    const provider = {
      id: "fake",
      model: "fake-model",
      stream: vi.fn(() => ["hello"]),
    };
    setChatDependenciesForTests({
      provider,
      repository: {
        getActivities: vi.fn().mockResolvedValue([]),
        getRecentActivities: vi.fn().mockResolvedValue([activity()]),
        insertActivities: vi.fn(),
      },
    });

    const response = await POST(chatRequest({ message: "", history: [] }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/message/);
    expect(provider.stream).not.toHaveBeenCalled();
  });

  it("returns an upload CTA when no activities are available", async () => {
    const provider = {
      id: "fake",
      model: "fake-model",
      stream: vi.fn(() => ["hello"]),
    };
    setChatDependenciesForTests({
      provider,
      repository: {
        getActivities: vi.fn().mockResolvedValue([]),
        getRecentActivities: vi.fn().mockResolvedValue([]),
        insertActivities: vi.fn(),
      },
    });

    const response = await POST(
      chatRequest({
        message: "Am I getting faster?",
        history: [],
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toBe("Upload your Garmin data to start chatting with Aeris.");
    expect(provider.stream).not.toHaveBeenCalled();
  });
});
