// @vitest-environment node

import { afterEach, describe, expect, it, vi } from "vitest";
import { createLlmProvider } from ".";
import { createOllamaProvider } from "./ollama";
import { createOpenAIProvider } from "./openai";
import type { LLMMessage } from "./types";

afterEach(() => {
  vi.restoreAllMocks();
});

const messages: LLMMessage[] = [
  { role: "system", content: "You are Aeris." },
  { role: "user", content: "Am I getting fitter?" },
];

async function collect(iterable: AsyncIterable<string> | Iterable<string>): Promise<string[]> {
  const chunks: string[] = [];

  for await (const chunk of iterable) {
    chunks.push(chunk);
  }

  return chunks;
}

function streamingResponse(lines: string[]): Response {
  const encoder = new TextEncoder();

  return new Response(
    new ReadableStream({
      start(controller) {
        for (const line of lines) {
          controller.enqueue(encoder.encode(`${line}\n\n`));
        }
        controller.close();
      },
    }),
    {
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
    },
  );
}

describe("OpenAI LLM provider", () => {
  it("streams Responses API text deltas without calling the real network in tests", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      streamingResponse([
        'data: {"type":"response.output_text.delta","delta":"hello"}',
        'data: {"type":"response.output_text.delta","delta":" world"}',
        "data: [DONE]",
      ]),
    );
    const provider = createOpenAIProvider({
      apiKey: "test-key",
      model: "gpt-5.5",
      fetch: fetchMock,
    });

    await expect(collect(provider.stream({ messages }))).resolves.toEqual([
      "hello",
      " world",
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.openai.com/v1/responses",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer test-key",
        }),
      }),
    );
  });

  it("does not add a per-turn output token cap to OpenAI requests", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      streamingResponse([
        'data: {"type":"response.output_text.delta","delta":"hello"}',
        "data: [DONE]",
      ]),
    );
    const provider = createOpenAIProvider({
      apiKey: "test-key",
      model: "gpt-5.5",
      fetch: fetchMock,
    });

    await collect(provider.stream({ messages }));

    const requestBody = JSON.parse(
      String(fetchMock.mock.calls[0]?.[1]?.body),
    ) as Record<string, unknown>;
    expect(requestBody).not.toHaveProperty("max_output_tokens");
    expect(requestBody).not.toHaveProperty("max_tokens");
    expect(requestBody).not.toHaveProperty("max_completion_tokens");
  });

  it("ignores OpenAI stream events that do not match the delta schema", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      streamingResponse([
        'data: {"type":"response.output_text.delta","delta":123}',
        'data: {"type":"response.output_text.delta","delta":"valid"}',
        "data: [DONE]",
      ]),
    );
    const provider = createOpenAIProvider({
      apiKey: "test-key",
      model: "gpt-5.5",
      fetch: fetchMock,
    });

    await expect(collect(provider.stream({ messages }))).resolves.toEqual(["valid"]);
  });

  it("fails malformed OpenAI stream payloads instead of silently completing", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      streamingResponse([
        'data: {"type":"response.output_text.delta","delta":"partial"}',
        "data: {not-json}",
      ]),
    );
    const provider = createOpenAIProvider({
      apiKey: "test-key",
      model: "gpt-5.5",
      fetch: fetchMock,
    });

    await expect(collect(provider.stream({ messages }))).rejects.toThrow(
      /Malformed OpenAI stream response/,
    );
  });

  it("aborts OpenAI streaming requests after the configured timeout", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(
      (_url: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("The operation was aborted.", "AbortError"));
          });
        }),
    );
    const provider = createOpenAIProvider({
      apiKey: "test-key",
      model: "gpt-5.5",
      fetch: fetchMock,
      timeoutMs: 25,
    });

    const result = collect(provider.stream({ messages }));
    const assertion = expect(result).rejects.toThrow(/OpenAI request timed out/);
    await vi.advanceTimersByTimeAsync(25);

    await assertion;
    vi.useRealTimers();
  });

  it("surfaces missing OPENAI_API_KEY before a provider can call OpenAI", () => {
    expect(() =>
      createLlmProvider({
        env: {
          LLM_PROVIDER: "openai",
          LLM_MODEL: "gpt-5.5",
        },
        fetch: vi.fn(),
      }),
    ).toThrow(/OPENAI_API_KEY/);
  });

  it("throws a configuration warning when LLM_PROVIDER is missing", () => {
    expect(() =>
      createLlmProvider({
        env: {
          OPENAI_API_KEY: "test-key",
          LLM_MODEL: "gpt-5.5",
        },
        fetch: vi.fn(),
      }),
    ).toThrow(/LLM_PROVIDER is required/);
  });

  it("throws a configuration warning when LLM_MODEL is missing", () => {
    expect(() =>
      createLlmProvider({
        env: {
          OPENAI_API_KEY: "test-key",
          LLM_PROVIDER: "openai",
        },
        fetch: vi.fn(),
      }),
    ).toThrow(/LLM_MODEL is required/);
  });
});

describe("Ollama LLM provider", () => {
  it("uses the default Ollama URL when OLLAMA_BASE_URL is blank", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: { content: "local answer" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const provider = createLlmProvider({
      env: {
        LLM_PROVIDER: "ollama",
        LLM_MODEL: "llama",
        OLLAMA_BASE_URL: " ",
      },
      fetch: fetchMock,
    });

    await expect(collect(provider.stream({ messages }))).resolves.toEqual(["local answer"]);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:11434/api/chat",
      expect.any(Object),
    );
  });

  it("yields message content from a valid Ollama response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: { content: "local answer" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const provider = createOllamaProvider({
      model: "llama",
      fetch: fetchMock,
    });

    await expect(collect(provider.stream({ messages }))).resolves.toEqual(["local answer"]);
  });

  it("does not yield content from an invalid Ollama response shape", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: { content: 123 } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const provider = createOllamaProvider({
      model: "llama",
      fetch: fetchMock,
    });

    await expect(collect(provider.stream({ messages }))).resolves.toEqual([]);
  });
});
