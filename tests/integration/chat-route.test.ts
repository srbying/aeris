// @vitest-environment node

import { afterEach, describe, expect, it, vi } from "vitest";
import { POST, runtime } from "../../src/app/api/chat/route";
import { resetChatDependenciesForTests, setChatDependenciesForTests } from "../../src/lib/llm/dependencies";
import type { Activity } from "../../src/lib/activity/types";
import type { LLMMessage, LLMStreamRequest } from "../../src/lib/llm/types";

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

function chatRequestWithSignal(body: unknown, signal: AbortSignal): Request {
  return new Request("http://aeris.test/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
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

  it("forwards the incoming request abort signal to the provider stream", async () => {
    const stream = vi.fn(() => ["hello"]);
    const fakeProvider = {
      id: "fake",
      model: "fake-model",
      stream,
    };
    const abortController = new AbortController();

    setChatDependenciesForTests({
      provider: fakeProvider,
      repository: {
        getActivities: vi.fn().mockResolvedValue([]),
        getRecentActivities: vi.fn().mockResolvedValue([activity()]),
        insertActivities: vi.fn(),
      },
    });

    const request = chatRequestWithSignal(
      {
        message: "Am I getting faster?",
        history: [],
      },
      abortController.signal,
    );
    const response = await POST(request);
    await readStream(response);

    expect(stream).toHaveBeenCalledWith(
      expect.objectContaining({
        signal: request.signal,
      }),
    );
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

  it("rejects messages over 2000 characters before calling a provider", async () => {
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

    const response = await POST(chatRequest({ message: "a".repeat(2001), history: [] }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/2000/);
    expect(provider.stream).not.toHaveBeenCalled();
  });

  it("rejects histories over 10 messages before calling a provider", async () => {
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

    const response = await POST(
      chatRequest({
        message: "Am I getting faster?",
        history: Array.from({ length: 11 }, () => ({
          role: "user",
          content: "Previous question",
        })),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/10/);
    expect(provider.stream).not.toHaveBeenCalled();
  });

  it("rejects history content over 2000 characters before calling a provider", async () => {
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

    const response = await POST(
      chatRequest({
        message: "Am I getting faster?",
        history: [{ role: "assistant", content: "a".repeat(2001) }],
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/2000/);
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

  it("injects computed date comparison facts into the system prompt", async () => {
    let capturedMessages: LLMMessage[] = [];
    const provider = {
      id: "fake",
      model: "fake-model",
      stream(request: LLMStreamRequest) {
        capturedMessages = request.messages;
        return ["May 17 took longer because pace was slower."];
      },
    };

    setChatDependenciesForTests({
      provider,
      repository: {
        getActivities: vi.fn().mockResolvedValue([]),
        getRecentActivities: vi.fn().mockResolvedValue([
          activity({
            activityDate: "2026-05-09T08:00:00.000Z",
            distanceKm: 18.13,
            durationSeconds: 4573,
            avgPaceSecPerKm: 252,
            avgHr: 146,
            ascentM: 21,
          }),
          activity({
            activityDate: "2026-05-17T08:00:00.000Z",
            distanceKm: 17.87,
            durationSeconds: 4804,
            avgPaceSecPerKm: 269,
            avgHr: 148,
            ascentM: 27,
          }),
        ]),
        insertActivities: vi.fn(),
      },
    });

    const response = await POST(
      chatRequest({
        message:
          "on May 17, 2026 I ran longer, but less distance compared to my run on May 9, 2026. Explain why",
        history: [],
      }),
    );
    const body = await readStream(response);
    const systemMessage = capturedMessages.find((message) => message.role === "system");

    expect(response.status).toBe(200);
    expect(body).toContain("May 17 took longer because pace was slower.");
    expect(systemMessage?.content).toContain("Date comparison facts compact JSON");
    expect(systemMessage?.content).toContain('"d":"2026-05-17"');
    expect(systemMessage?.content).toContain('"dur":4804');
    expect(systemMessage?.content).toContain('"dur":231');
    expect(systemMessage?.content).toContain("average pace was slower");
  });
});
