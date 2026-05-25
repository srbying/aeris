import { z } from "zod";
import type { LLMProvider, LLMStreamRequest } from "./types";

type OllamaProviderOptions = {
  model: string;
  baseUrl?: string;
  fetch?: typeof fetch;
};

const OllamaResponseSchema = z.object({
  message: z.object({
    content: z.string(),
  }),
});

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
      const parsedBody = OllamaResponseSchema.safeParse(body);

      if (parsedBody.success) {
        yield parsedBody.data.message.content;
      }
    },
  };
}
