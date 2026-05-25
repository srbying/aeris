import type { LLMMessage, LLMProvider, LLMStreamRequest } from "./types";

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";

type OpenAIProviderOptions = {
  apiKey: string;
  model: string;
  fetch?: typeof fetch;
};

export function createOpenAIProvider({
  apiKey,
  model,
  fetch: fetcher = globalThis.fetch,
}: OpenAIProviderOptions): LLMProvider {
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required when LLM_PROVIDER=openai.");
  }

  return {
    id: "openai",
    model,
    async *stream(request: LLMStreamRequest) {
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
        signal: request.signal,
      });

      if (!response.ok) {
        throw new Error("OpenAI request failed.");
      }

      if (!response.body) {
        return;
      }

      yield* parseResponsesStream(response.body);
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

    if (
      parsed &&
      typeof parsed === "object" &&
      "type" in parsed &&
      parsed.type === "response.output_text.delta" &&
      "delta" in parsed &&
      typeof parsed.delta === "string"
    ) {
      return parsed.delta;
    }
  } catch {
    return null;
  }

  return null;
}
