import type { LLMProvider, LLMStreamRequest } from "./types";

type OllamaProviderOptions = {
  model: string;
  baseUrl?: string;
  fetch?: typeof fetch;
};

export function createOllamaProvider({
  model,
  baseUrl = "http://localhost:11434",
  fetch: fetcher = globalThis.fetch,
}: OllamaProviderOptions): LLMProvider {
  return {
    id: "ollama",
    model,
    async *stream(request: LLMStreamRequest) {
      const response = await fetcher(`${baseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          messages: request.messages,
          stream: false,
        }),
        signal: request.signal,
      });

      if (!response.ok) {
        throw new Error("Ollama request failed.");
      }

      const body: unknown = await response.json();

      if (
        body &&
        typeof body === "object" &&
        "message" in body &&
        body.message &&
        typeof body.message === "object" &&
        "content" in body.message &&
        typeof body.message.content === "string"
      ) {
        yield body.message.content;
      }
    },
  };
}
