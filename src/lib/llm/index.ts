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
  const provider = requireEnv(env, "LLM_PROVIDER");
  const model = requireEnv(env, "LLM_MODEL");

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

function requireEnv(env: Record<string, string | undefined>, key: string): string {
  const value = env[key]?.trim();

  if (!value) {
    throw new Error(`Configuration warning: ${key} is required.`);
  }

  return value;
}

export type { LLMMessage, LLMProvider, LLMRole, LLMStreamRequest } from "./types";
