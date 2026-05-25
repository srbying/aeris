// @vitest-environment node

import { afterEach, describe, expect, it, vi } from "vitest";
import { createLlmProvider } from "../../src/lib/llm";
import { createOllamaProvider } from "../../src/lib/llm/ollama";
import { createOpenAIProvider } from "../../src/lib/llm/openai";
import type { LLMMessage } from "../../src/lib/llm/types";

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

  it("selects OpenAI as the default provider and model", () => {
    const provider = createLlmProvider({
      env: {
        OPENAI_API_KEY: "test-key",
      },
      fetch: vi.fn(),
    });

    expect(provider.id).toBe("openai");
    expect(provider.model).toBe("gpt-5.5");
  });
});

describe("Ollama LLM provider", () => {
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
