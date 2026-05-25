import { createOllamaProvider } from "./ollama";
import { createOpenAIProvider } from "./openai";
import type { LLMProvider } from "./types";

type LlmProviderFactoryOptions = {
  env?: Record<string, string | undefined>;
  fetch?: typeof fetch;
};

export function createLlmProvider({
  env = process.env,
  fetch: fetcher = globalThis.fetch,
}: LlmProviderFactoryOptions = {}): LLMProvider {
  const provider = env.LLM_PROVIDER?.trim() || "openai";
  const model = env.LLM_MODEL?.trim() || "gpt-5.5";

  if (provider === "openai") {
    return createOpenAIProvider({
      apiKey: env.OPENAI_API_KEY ?? "",
      model,
      fetch: fetcher,
    });
  }

  if (provider === "ollama") {
    return createOllamaProvider({
      model,
      baseUrl: env.OLLAMA_BASE_URL,
      fetch: fetcher,
    });
  }

  throw new Error(`Unsupported LLM_PROVIDER: ${provider}`);
}

export type { LLMMessage, LLMProvider, LLMRole, LLMStreamRequest } from "./types";
