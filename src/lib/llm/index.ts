import { z } from "zod";
import { createOllamaProvider } from "./ollama";
import { createOpenAIProvider } from "./openai";
import type { LLMProvider } from "./types";

type LlmProviderFactoryOptions = {
  env?: Record<string, string | undefined>;
  fetch?: typeof fetch;
};

const requiredTrimmedString = (key: string) =>
  z.preprocess(
    (value) => (typeof value === "string" ? value.trim() : value),
    z.string({ error: `Configuration warning: ${key} is required.` }).min(1, {
      error: `Configuration warning: ${key} is required.`,
    }),
  );

const optionalTrimmedString = z.preprocess(
  (value) => {
    if (typeof value !== "string") {
      return value;
    }

    const trimmed = value.trim();
    return trimmed === "" ? undefined : trimmed;
  },
  z.string().optional(),
);

const llmEnvSchema = z.object({
  LLM_PROVIDER: requiredTrimmedString("LLM_PROVIDER").pipe(z.enum(["openai", "ollama"])),
  LLM_MODEL: requiredTrimmedString("LLM_MODEL"),
  OPENAI_API_KEY: optionalTrimmedString,
  OLLAMA_BASE_URL: optionalTrimmedString,
});

export function createLlmProvider({
  env = process.env,
  fetch: fetcher = globalThis.fetch,
}: LlmProviderFactoryOptions = {}): LLMProvider {
  const {
    LLM_PROVIDER: provider,
    LLM_MODEL: model,
    OPENAI_API_KEY: openaiApiKey,
    OLLAMA_BASE_URL: ollamaBaseUrl,
  } = llmEnvSchema.parse(env);

  if (provider === "openai") {
    return createOpenAIProvider({
      apiKey: openaiApiKey ?? "",
      model,
      fetch: fetcher,
    });
  }

  if (provider === "ollama") {
    return createOllamaProvider({
      model,
      baseUrl: ollamaBaseUrl,
      fetch: fetcher,
    });
  }

  throw new Error(`Unsupported LLM_PROVIDER: ${provider}`);
}

export type { LLMMessage, LLMProvider, LLMRole, LLMStreamRequest } from "./types";
