export type LLMRole = "system" | "user" | "assistant";

export type LLMMessage = {
  role: LLMRole;
  content: string;
};

export type LLMStreamRequest = {
  messages: LLMMessage[];
  signal?: AbortSignal;
};

export type LLMProvider = {
  id: string;
  model: string;
  stream(request: LLMStreamRequest): AsyncIterable<string> | Iterable<string>;
};
