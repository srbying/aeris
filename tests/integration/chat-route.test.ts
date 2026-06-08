// @vitest-environment node

import { afterEach, describe, expect, it, vi } from "vitest";
import { POST, runtime } from "../../src/app/api/chat/route";
import {
  consumeDemoChatTurn,
  createInMemoryDemoAllowanceRepository,
} from "../../src/lib/demo/demo-allowance";
import {
  resetDemoAllowanceDependenciesForTests,
  setDemoAllowanceDependenciesForTests,
} from "../../src/lib/demo/dependencies";
import { resetChatDependenciesForTests, setChatDependenciesForTests } from "../../src/lib/llm/dependencies";
import type { Activity } from "../../src/lib/activity/types";
import type { LLMMessage, LLMStreamRequest } from "../../src/lib/llm/types";

afterEach(() => {
  resetChatDependenciesForTests();
  resetDemoAllowanceDependenciesForTests();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
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

function chatRequestWithCookie(body: unknown, cookie: string): Request {
  return new Request("http://aeris.test/api/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie,
    },
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

  it("sets an opaque visitor cookie and consumes one turn for allowed demo chat", async () => {
    vi.stubEnv("DEMO_CHAT_ALLOWANCE_ENABLED", "true");
    vi.stubEnv("DEMO_CHAT_TURN_LIMIT", "3");
    const demoRepository = createInMemoryDemoAllowanceRepository();
    const provider = {
      id: "fake",
      model: "fake-model",
      stream: vi.fn(() => ["hello"]),
    };
    setDemoAllowanceDependenciesForTests({
      generateVisitorToken: () => "visitor-token",
      repository: demoRepository,
    });
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
        history: [],
      }),
    );
    const body = await readStream(response);

    expect(response.status).toBe(200);
    expect(response.headers.get("Set-Cookie")).toContain(
      "aeris_demo_visitor=visitor-token",
    );
    expect(response.headers.get("Set-Cookie")).toContain("HttpOnly");
    expect(body).toContain('data: {"delta":"hello"}');
    expect(provider.stream).toHaveBeenCalled();
    await expect(demoRepository.getUsageByVisitorToken("visitor-token")).resolves.toMatchObject({
      turnsUsed: 1,
    });
  });

  it("reuses an existing visitor cookie without setting a replacement cookie", async () => {
    vi.stubEnv("DEMO_CHAT_ALLOWANCE_ENABLED", "true");
    const demoRepository = createInMemoryDemoAllowanceRepository();
    const provider = {
      id: "fake",
      model: "fake-model",
      stream: vi.fn(() => ["hello"]),
    };
    setDemoAllowanceDependenciesForTests({
      generateVisitorToken: () => "unused-token",
      repository: demoRepository,
    });
    setChatDependenciesForTests({
      provider,
      repository: {
        getActivities: vi.fn().mockResolvedValue([]),
        getRecentActivities: vi.fn().mockResolvedValue([activity()]),
        insertActivities: vi.fn(),
      },
    });

    const response = await POST(
      chatRequestWithCookie(
        {
          message: "Am I getting faster?",
          history: [],
        },
        "aeris_demo_visitor=existing-token",
      ),
    );
    await readStream(response);

    expect(response.status).toBe(200);
    expect(response.headers.get("Set-Cookie")).toBeNull();
    await expect(demoRepository.getUsageByVisitorToken("existing-token")).resolves.toMatchObject({
      turnsUsed: 1,
    });
  });

  it("does not create demo usage for invalid chat requests", async () => {
    vi.stubEnv("DEMO_CHAT_ALLOWANCE_ENABLED", "true");
    const demoRepository = createInMemoryDemoAllowanceRepository();
    const provider = {
      id: "fake",
      model: "fake-model",
      stream: vi.fn(() => ["hello"]),
    };
    setDemoAllowanceDependenciesForTests({
      generateVisitorToken: () => "visitor-token",
      repository: demoRepository,
    });
    setChatDependenciesForTests({
      provider,
      repository: {
        getActivities: vi.fn().mockResolvedValue([]),
        getRecentActivities: vi.fn().mockResolvedValue([activity()]),
        insertActivities: vi.fn(),
      },
    });

    const response = await POST(chatRequest({ message: "", history: [] }));

    expect(response.status).toBe(400);
    expect(response.headers.get("Set-Cookie")).toBeNull();
    expect(provider.stream).not.toHaveBeenCalled();
    await expect(demoRepository.getUsageByVisitorToken("visitor-token")).resolves.toBeNull();
  });

  it("does not create demo usage for setup-blocked chat responses", async () => {
    vi.stubEnv("DEMO_CHAT_ALLOWANCE_ENABLED", "true");
    const demoRepository = createInMemoryDemoAllowanceRepository();
    const provider = {
      id: "fake",
      model: "fake-model",
      stream: vi.fn(() => ["hello"]),
    };
    setDemoAllowanceDependenciesForTests({
      generateVisitorToken: () => "visitor-token",
      repository: demoRepository,
    });
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

    expect(response.status).toBe(409);
    expect(response.headers.get("Set-Cookie")).toBeNull();
    expect(provider.stream).not.toHaveBeenCalled();
    await expect(demoRepository.getUsageByVisitorToken("visitor-token")).resolves.toBeNull();
  });

  it("rejects exhausted demo visitors before calling the provider", async () => {
    const env = {
      DEMO_CHAT_ALLOWANCE_ENABLED: "true",
      DEMO_CHAT_TURN_LIMIT: "1",
    };
    vi.stubEnv("DEMO_CHAT_ALLOWANCE_ENABLED", env.DEMO_CHAT_ALLOWANCE_ENABLED);
    vi.stubEnv("DEMO_CHAT_TURN_LIMIT", env.DEMO_CHAT_TURN_LIMIT);
    const demoRepository = createInMemoryDemoAllowanceRepository();
    const provider = {
      id: "fake",
      model: "fake-model",
      stream: vi.fn(() => ["hello"]),
    };
    await consumeDemoChatTurn({
      env,
      generateVisitorToken: () => "visitor-token",
      repository: demoRepository,
      visitorToken: "visitor-token",
    });
    setDemoAllowanceDependenciesForTests({
      generateVisitorToken: () => "unused-token",
      repository: demoRepository,
    });
    setChatDependenciesForTests({
      provider,
      repository: {
        getActivities: vi.fn().mockResolvedValue([]),
        getRecentActivities: vi.fn().mockResolvedValue([activity()]),
        insertActivities: vi.fn(),
      },
    });

    const response = await POST(
      chatRequestWithCookie(
        {
          message: "Am I getting faster?",
          history: [],
        },
        "aeris_demo_visitor=visitor-token",
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(429);
    expect(body.error).toBe("Public demo chat allowance is finished.");
    expect(provider.stream).not.toHaveBeenCalled();
    await expect(demoRepository.getUsageByVisitorToken("visitor-token")).resolves.toMatchObject({
      turnsUsed: 1,
    });
  });

  it("keeps follow-up suggestions working for allowed demo chat turns", async () => {
    vi.stubEnv("DEMO_CHAT_ALLOWANCE_ENABLED", "true");
    vi.stubEnv("DEMO_CHAT_TURN_LIMIT", "2");
    const demoRepository = createInMemoryDemoAllowanceRepository();
    const capturedRequests: LLMStreamRequest[] = [];
    const provider = {
      id: "fake",
      model: "fake-model",
      stream(request: LLMStreamRequest) {
        capturedRequests.push(request);

        if (capturedRequests.length === 1) {
          return ["Allowed answer."];
        }

        return [JSON.stringify({ suggestions: ["Show the raw numbers."] })];
      },
    };
    setDemoAllowanceDependenciesForTests({
      generateVisitorToken: () => "visitor-token",
      repository: demoRepository,
    });
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
        history: [],
      }),
    );
    const body = await readStream(response);

    expect(response.status).toBe(200);
    expect(body).toContain('data: {"delta":"Allowed answer."}');
    expect(body).toContain('data: {"suggestions":["Show the raw numbers."]}');
    expect(capturedRequests).toHaveLength(2);
    await expect(demoRepository.getUsageByVisitorToken("visitor-token")).resolves.toMatchObject({
      turnsUsed: 1,
    });
  });

  it("returns a provider failure when OpenAI cannot start streaming", async () => {
    const provider = {
      id: "fake",
      model: "fake-model",
      stream: vi.fn(() => {
        throw new Error("provider unavailable");
      }),
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
        message: "How many miles did I run in April?",
        history: [],
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body.error).toBe("Aeris could not reach the AI provider. Please try again.");
  });

  it("streams a friendly error when the provider fails mid-response", async () => {
    const provider = {
      id: "fake",
      model: "fake-model",
      async *stream() {
        yield "April total";
        throw new Error("stream interrupted");
      },
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
        message: "How many miles did I run in April?",
        history: [],
      }),
    );
    const body = await readStream(response);

    expect(response.status).toBe(200);
    expect(body).toContain('data: {"delta":"April total"}');
    expect(body).toContain(
      'data: {"error":"Response interrupted. Please retry your question."}',
    );
  });

  it("streams LLM-generated follow-up suggestions before done", async () => {
    const capturedRequests: LLMStreamRequest[] = [];
    const provider = {
      id: "fake",
      model: "fake-model",
      stream(request: LLMStreamRequest) {
        capturedRequests.push(request);

        if (capturedRequests.length === 1) {
          return ["**Directionally yes.** Your aerobic efficiency is improving."];
        }

        return [
          JSON.stringify({
            suggestions: [
              "Which older runs are you comparing that to?",
              "Show the raw aerobic efficiency values.",
              "What changed most in the recent runs?",
            ],
          }),
        ];
      },
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
        message: "Am I getting faster at the same heart rate?",
        history: [{ role: "assistant", content: "Earlier answer." }],
        excludedSuggestions: ["Show the raw numbers behind that."],
      }),
    );
    const body = await readStream(response);

    expect(response.status).toBe(200);
    expect(body).toContain(
      'data: {"delta":"**Directionally yes.** Your aerobic efficiency is improving."}',
    );
    expect(body).toContain(
      'data: {"suggestions":["Which older runs are you comparing that to?","Show the raw aerobic efficiency values.","What changed most in the recent runs?"]}',
    );
    expect(body.indexOf('"suggestions"')).toBeLessThan(body.indexOf('"done"'));
    expect(capturedRequests).toHaveLength(2);
    expect(capturedRequests[1]?.messages.at(-1)?.content).toContain(
      "Show the raw numbers behind that.",
    );
    expect(capturedRequests[1]?.messages[0]?.content).toContain(
      "Do not suggest coaching recommendations or training plans.",
    );
  });

  it("finishes the answer stream when follow-up suggestion generation fails", async () => {
    let streamCallCount = 0;
    const provider = {
      id: "fake",
      model: "fake-model",
      stream() {
        streamCallCount += 1;

        if (streamCallCount === 1) {
          return ["Answer without suggestions."];
        }

        throw new Error("suggestions unavailable");
      },
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
        history: [],
      }),
    );
    const body = await readStream(response);

    expect(response.status).toBe(200);
    expect(body).toContain('data: {"delta":"Answer without suggestions."}');
    expect(body).not.toContain('"suggestions"');
    expect(body).not.toContain('"error"');
    expect(body).toContain('data: {"done":true}');
  });

  it("injects computed date comparison facts into the system prompt", async () => {
    const capturedMessageCalls: LLMMessage[][] = [];
    const provider = {
      id: "fake",
      model: "fake-model",
      stream(request: LLMStreamRequest) {
        capturedMessageCalls.push(request.messages);
        return capturedMessageCalls.length === 1
          ? ["May 17 took longer because pace was slower."]
          : [JSON.stringify({ suggestions: [] })];
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
    const systemMessage = capturedMessageCalls[0]?.find((message) => message.role === "system");

    expect(response.status).toBe(200);
    expect(body).toContain("May 17 took longer because pace was slower.");
    expect(systemMessage?.content).toContain("Date comparison facts compact JSON");
    expect(systemMessage?.content).toContain('"d":"2026-05-17"');
    expect(systemMessage?.content).toContain('"dur":4804');
    expect(systemMessage?.content).toContain('"dur":231');
    expect(systemMessage?.content).toContain("average pace was slower");
  });

  it("injects the flagship same-heart-rate answer contract with imperial running context", async () => {
    const capturedMessageCalls: LLMMessage[][] = [];
    const provider = {
      id: "fake",
      model: "fake-model",
      stream(request: LLMStreamRequest) {
        capturedMessageCalls.push(request.messages);
        return capturedMessageCalls.length === 1
          ? ["**Directionally yes.**"]
          : [JSON.stringify({ suggestions: [] })];
      },
    };

    setChatDependenciesForTests({
      provider,
      repository: {
        getActivities: vi.fn().mockResolvedValue([]),
        getRecentActivities: vi.fn().mockResolvedValue([
          activity({
            id: "older-1",
            activityDate: "2026-02-10T08:00:00.000Z",
            distanceKm: 10,
            durationSeconds: 3600,
            avgPaceSecPerKm: 360,
            avgHr: 145,
          }),
          activity({
            id: "older-2",
            activityDate: "2026-02-20T08:00:00.000Z",
            distanceKm: 10,
            durationSeconds: 3540,
            avgPaceSecPerKm: 354,
            avgHr: 146,
          }),
          activity({
            id: "recent-1",
            activityDate: "2026-05-10T08:00:00.000Z",
            distanceKm: 10,
            durationSeconds: 3300,
            avgPaceSecPerKm: 330,
            avgHr: 145,
          }),
          activity({
            id: "recent-2",
            activityDate: "2026-05-20T08:00:00.000Z",
            distanceKm: 10,
            durationSeconds: 3180,
            avgPaceSecPerKm: 318,
            avgHr: 146,
          }),
        ]),
        insertActivities: vi.fn(),
      },
    });

    const response = await POST(
      chatRequest({
        message: "Am I getting faster at the same heart rate?",
        history: [],
      }),
    );
    const body = await readStream(response);
    const systemMessage = capturedMessageCalls[0]?.find((message) => message.role === "system");

    expect(response.status).toBe(200);
    expect(body).toContain('data: {"delta":"**Directionally yes.**"}');
    expect(body).toContain('data: {"done":true}');
    expect(systemMessage?.content).toContain("Default display unit system: imperial");
    expect(systemMessage?.content).toContain('"paceText":"8:51 /mi"');
    expect(systemMessage?.content).toContain('"distText":"6.2 mi"');
    expect(systemMessage?.content).toContain('"hrText":"145 bpm"');
    expect(systemMessage?.content).toContain("speed per heartbeat");
    expect(systemMessage?.content).toContain(
      'For same-heart-rate trend questions like "Am I getting faster at the same heart rate?"',
    );
    expect(systemMessage?.content).toContain("lead with a direct plain-language verdict");
    expect(systemMessage?.content).toContain("cite only the smallest useful set of key runs");
    expect(systemMessage?.content).toContain("more speed for a similar heart-rate cost");
    expect(systemMessage?.content).toContain(
      "say when the data is insufficient instead of manufacturing certainty",
    );
    expect(systemMessage?.content).toContain("Do not provide coaching recommendations");
    expect(systemMessage?.content).toContain("Do not create training plans");
  });

  it("injects sharp running friend guardrails into normal answer prompts", async () => {
    const capturedMessageCalls: LLMMessage[][] = [];
    const provider = {
      id: "fake",
      model: "fake-model",
      stream(request: LLMStreamRequest) {
        capturedMessageCalls.push(request.messages);
        return capturedMessageCalls.length === 1
          ? ["**Directionally yes.**"]
          : [JSON.stringify({ suggestions: [] })];
      },
    };

    setChatDependenciesForTests({
      provider,
      repository: {
        getActivities: vi.fn().mockResolvedValue([]),
        getRecentActivities: vi.fn().mockResolvedValue([
          activity({
            id: "older",
            activityDate: "2026-02-10T08:00:00.000Z",
            avgPaceSecPerKm: 360,
            avgHr: 145,
          }),
          activity({
            id: "recent",
            activityDate: "2026-05-20T08:00:00.000Z",
            avgPaceSecPerKm: 318,
            avgHr: 146,
          }),
        ]),
        insertActivities: vi.fn(),
      },
    });

    const response = await POST(
      chatRequest({
        message: "Am I getting faster?",
        history: [],
      }),
    );
    await readStream(response);
    const systemMessage = capturedMessageCalls[0]?.find((message) => message.role === "system");

    expect(response.status).toBe(200);
    expect(systemMessage?.content).toContain("Avoid motivational hype");
    expect(systemMessage?.content).toContain(
      "Do not praise, cheerlead, or use motivational language",
    );
    expect(systemMessage?.content).toContain(
      "Do not call a run better or worse unless the user has defined the comparison axis",
    );
    expect(systemMessage?.content).toContain("name the measured axis");
    expect(systemMessage?.content).toContain(
      "Do not imply statistical confidence, significance, certainty, or precision unless a statistic was actually computed",
    );
    expect(systemMessage?.content).toContain("Do not provide coaching recommendations");
    expect(systemMessage?.content).toContain("Do not create training plans");
  });

  it("injects raw-number drilldown context for follow-up requests", async () => {
    const capturedMessageCalls: LLMMessage[][] = [];
    const provider = {
      id: "fake",
      model: "fake-model",
      stream(request: LLMStreamRequest) {
        capturedMessageCalls.push(request.messages);
        return capturedMessageCalls.length === 1
          ? ["Here are the raw numbers."]
          : [JSON.stringify({ suggestions: [] })];
      },
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
        message: "Show raw numbers, including raw aerobic efficiency.",
        history: [
          { role: "user", content: "Am I getting faster at the same heart rate?" },
          { role: "assistant", content: "**Directionally yes.** Recent similar-HR runs are faster." },
        ],
      }),
    );
    await readStream(response);
    const answerMessages = capturedMessageCalls[0] ?? [];
    const systemMessage = answerMessages.find((message) => message.role === "system");

    expect(response.status).toBe(200);
    expect(answerMessages.map((message) => message.role)).toEqual([
      "system",
      "user",
      "assistant",
      "user",
    ]);
    expect(systemMessage?.content).toContain("Raw-number drilldown requested: true");
    expect(systemMessage?.content).toContain('"eff":0.0192');
    expect(systemMessage?.content).toContain("Show raw efficiency numbers");
  });

  it("injects older-run drilldown context for reference follow-ups", async () => {
    const capturedMessageCalls: LLMMessage[][] = [];
    const provider = {
      id: "fake",
      model: "fake-model",
      stream(request: LLMStreamRequest) {
        capturedMessageCalls.push(request.messages);
        return capturedMessageCalls.length === 1
          ? ["The older references were February 10 and February 20."]
          : [JSON.stringify({ suggestions: [] })];
      },
    };

    setChatDependenciesForTests({
      provider,
      repository: {
        getActivities: vi.fn().mockResolvedValue([]),
        getRecentActivities: vi.fn().mockResolvedValue([
          activity({
            id: "older-1",
            activityDate: "2026-02-10T08:00:00.000Z",
            distanceKm: 10,
            durationSeconds: 3600,
            avgPaceSecPerKm: 360,
            avgHr: 145,
          }),
          activity({
            id: "recent-1",
            activityDate: "2026-05-20T08:00:00.000Z",
            distanceKm: 10,
            durationSeconds: 3180,
            avgPaceSecPerKm: 318,
            avgHr: 146,
          }),
        ]),
        insertActivities: vi.fn(),
      },
    });

    const response = await POST(
      chatRequest({
        message: "Which older runs were behind that?",
        history: [
          { role: "user", content: "Am I getting faster at the same heart rate?" },
          {
            role: "assistant",
            content: "Recent similar-HR runs look faster than older February references.",
          },
        ],
      }),
    );
    await readStream(response);
    const systemMessage = capturedMessageCalls[0]?.find((message) => message.role === "system");

    expect(response.status).toBe(200);
    expect(systemMessage?.content).toContain("Older-run reference drilldown requested: true");
    expect(systemMessage?.content).toContain("resolve short follow-ups");
    expect(systemMessage?.content).toContain('"d":"2026-02-10"');
    expect(systemMessage?.content).toContain('"d":"2026-05-20"');
  });

  it("injects metric display fields when the latest user wording asks for metric units", async () => {
    const capturedMessageCalls: LLMMessage[][] = [];
    const provider = {
      id: "fake",
      model: "fake-model",
      stream(request: LLMStreamRequest) {
        capturedMessageCalls.push(request.messages);
        return capturedMessageCalls.length === 1
          ? ["Metric answer."]
          : [JSON.stringify({ suggestions: [] })];
      },
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
        message: "Show this in kilometers and min/km.",
        history: [{ role: "user", content: "Use miles and feet by default." }],
      }),
    );
    await readStream(response);
    const systemMessage = capturedMessageCalls[0]?.find((message) => message.role === "system");

    expect(response.status).toBe(200);
    expect(systemMessage?.content).toContain("Default display unit system: metric");
    expect(systemMessage?.content).toContain('"paceText":"6:00 /km"');
    expect(systemMessage?.content).toContain('"hrText":"145 bpm"');
    expect(systemMessage?.content).toContain('"distText":"10.0 km"');
    expect(systemMessage?.content).toContain('"ascText":"40 m"');
  });
});
