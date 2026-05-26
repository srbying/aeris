import { z } from "zod";
import type { LLMMessage, LLMProvider, LLMStreamRequest } from "./types";

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const OpenAIOutputTextDeltaSchema = z.object({
  type: z.literal("response.output_text.delta"),
  delta: z.string(),
});

type OpenAIProviderOptions = {
  apiKey: string;
  model: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
};

export function createOpenAIProvider({
  apiKey,
  model,
  fetch: fetcher = globalThis.fetch,
  timeoutMs = getOpenAIStreamTimeoutMs(),
}: OpenAIProviderOptions): LLMProvider {
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required when LLM_PROVIDER=openai.");
  }

  return {
    id: "openai",
    model,
    async *stream(request: LLMStreamRequest) {
      const abortController = new AbortController();
      let didTimeout = false;
      const timeoutId = setTimeout(() => {
        didTimeout = true;
        abortController.abort();
      }, timeoutMs);
      const abortFromRequest = () => {
        abortController.abort();
      };

      request.signal?.addEventListener("abort", abortFromRequest, { once: true });

      try {
        const response = await fetcher(OPENAI_RESPONSES_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            input: toResponsesInput(request.messages),
            stream: true,
          }),
          signal: abortController.signal,
        });

        if (!response.ok) {
          throw new Error("OpenAI request failed.");
        }

        if (!response.body) {
          return;
        }

        yield* parseResponsesStream(response.body);
      } catch (error) {
        if (didTimeout && isAbortError(error)) {
          throw new Error("OpenAI request timed out.");
        }

        throw error;
      } finally {
        clearTimeout(timeoutId);
        request.signal?.removeEventListener("abort", abortFromRequest);
      }
    },
  };
}

function toResponsesInput(messages: LLMMessage[]) {
  return messages.map((message) => ({
    role: message.role,
    content: message.content,
  }));
}

async function* parseResponsesStream(body: ReadableStream<Uint8Array>): AsyncIterable<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();

    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";

    for (const event of events) {
      const delta = parseOpenAIEvent(event);

      if (delta !== null) {
        yield delta;
      }
    }
  }

  buffer += decoder.decode();
  const delta = parseOpenAIEvent(buffer);

  if (delta !== null) {
    yield delta;
  }
}

function parseOpenAIEvent(event: string): string | null {
  const dataLine = event
    .split("\n")
    .find((line) => line.startsWith("data:"));

  if (!dataLine) {
    return null;
  }

  const data = dataLine.replace(/^data:\s*/, "");

  if (data === "[DONE]") {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(data);
    const deltaEvent = OpenAIOutputTextDeltaSchema.safeParse(parsed);

    return deltaEvent.success ? deltaEvent.data.delta : null;
  } catch {
    throw new Error("Malformed OpenAI stream response.");
  }
}

function getOpenAIStreamTimeoutMs(): number {
  const parsed = Number.parseInt(process.env.OPENAI_STREAM_TIMEOUT_MS ?? "", 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 30_000;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}
