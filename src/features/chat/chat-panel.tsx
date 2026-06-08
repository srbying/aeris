"use client";

import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { ChatInput } from "./chat-input";
import { type ChatMessage, MessageList } from "./message-list";

type ChatStatus = "idle" | "streaming";

const MAX_CHAT_HISTORY_MESSAGES = 10;
const StreamEventSchema = z
  .object({
    delta: z.string().optional(),
    done: z.boolean().optional(),
    error: z.string().optional(),
    suggestions: z.array(z.string()).optional(),
  })
  .strict();

const DemoAllowanceStatusSchema = z
  .object({
    enabled: z.boolean(),
    limit: z.number().int().positive(),
    remaining: z.number().int().nonnegative(),
    exhausted: z.boolean(),
    availability: z.enum(["available", "unavailable"]),
  })
  .strict();

type StreamEvent = z.infer<typeof StreamEventSchema>;
type DemoAllowanceStatus = z.infer<typeof DemoAllowanceStatusSchema>;
type ChatHistoryMessage = Pick<ChatMessage, "role" | "content">;

const STARTER_PROMPTS = [
  "Am I getting faster at the same heart rate?",
  "Which run had my best pace-to-HR ratio?",
  "How has my VO2 max changed over 6 months?",
];

const MAX_EXCLUDED_SUGGESTIONS = 20;
const MAX_FOLLOW_UP_PROMPTS = 3;
const DEMO_FINISHED_MESSAGE =
  "Public demo complete. Your conversation stays here, but new questions are paused.";

export function ChatPanel() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState<ChatStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);
  const [followUpPrompts, setFollowUpPrompts] = useState<string[]>([]);
  const [demoAllowanceStatus, setDemoAllowanceStatus] =
    useState<DemoAllowanceStatus | null>(null);
  const shownSuggestionHistoryRef = useRef<string[]>([]);
  const scrollAnchorRef = useRef<HTMLDivElement>(null);
  const isDemoFinished = isDemoAllowanceFinished(demoAllowanceStatus);
  const isChatInputDisabled = status === "streaming" || isDemoFinished;

  useEffect(() => {
    let isMounted = true;

    async function loadDemoAllowanceStatus() {
      const nextStatus = await readDemoAllowanceStatus();

      if (isMounted && nextStatus) {
        setDemoAllowanceStatus(nextStatus);
      }
    }

    void loadDemoAllowanceStatus();

    return () => {
      isMounted = false;
    };
  }, []);

  async function refreshDemoAllowanceStatus() {
    const nextStatus = await readDemoAllowanceStatus();

    if (nextStatus) {
      setDemoAllowanceStatus(nextStatus);
    }
  }

  useEffect(() => {
    if (messages.length === 0 && !error) {
      return;
    }

    const scrollAnchor = scrollAnchorRef.current;

    if (typeof scrollAnchor?.scrollIntoView === "function") {
      scrollAnchor.scrollIntoView({ block: "end" });
    }
  }, [messages, error, streamingMessageId, followUpPrompts]);

  async function submitMessage(message: string) {
    const trimmedMessage = message.trim();

    if (!trimmedMessage || status === "streaming" || isDemoFinished) {
      return;
    }

    const { userMessage, assistantMessage } = createChatExchange(trimmedMessage);
    const history = buildChatHistory(messages);

    setMessages((currentMessages) => [...currentMessages, userMessage, assistantMessage]);
    setDraft("");
    setStatus("streaming");
    setStreamingMessageId(assistantMessage.id);
    setError(null);
    setFollowUpPrompts([]);

    try {
      const streamError = await sendChatMessage({
        excludedSuggestions: shownSuggestionHistoryRef.current.slice(-MAX_EXCLUDED_SUGGESTIONS),
        message: trimmedMessage,
        history,
        onDelta: (delta) => {
          appendAssistantDelta(assistantMessage.id, delta);
        },
        onSuggestions: showFollowUpPrompts,
      });

      if (streamError) {
        setError(streamError);
      }
      await refreshDemoAllowanceStatus();
    } catch (caughtError) {
      if (caughtError instanceof ChatRequestError && caughtError.status === 429) {
        setMessages((currentMessages) =>
          currentMessages.filter(
            (currentMessage) =>
              currentMessage.id !== userMessage.id &&
              currentMessage.id !== assistantMessage.id,
          ),
        );
        setDemoAllowanceStatus(buildFinishedDemoAllowanceStatus(demoAllowanceStatus));
        setError(null);
        setFollowUpPrompts([]);
      } else {
        setError(caughtError instanceof Error ? caughtError.message : "Chat failed.");
      }
    } finally {
      setStatus("idle");
      setStreamingMessageId(null);
    }
  }

  function appendAssistantDelta(messageId: string, delta: string) {
    setMessages((currentMessages) =>
      currentMessages.map((message) =>
        message.id === messageId
          ? { ...message, content: `${message.content}${delta}` }
          : message,
      ),
    );
  }

  function showFollowUpPrompts(suggestions: string[]) {
    const prompts = uniquePrompts(suggestions, shownSuggestionHistoryRef.current).slice(
      0,
      MAX_FOLLOW_UP_PROMPTS,
    );

    setFollowUpPrompts(prompts);

    if (prompts.length > 0) {
      shownSuggestionHistoryRef.current = uniquePromptHistory([
        ...shownSuggestionHistoryRef.current,
        ...prompts,
      ]).slice(-MAX_EXCLUDED_SUGGESTIONS);
    }
  }

  return (
    <section
      aria-label="Aeris chat window"
      className="flex h-full min-h-[280px] w-full flex-col overflow-hidden rounded-lg border border-zinc-200/80 bg-white shadow-[0_18px_48px_rgba(15,23,42,0.08)]"
    >
      <div className="border-b border-zinc-200/80 bg-white px-4 py-4 sm:px-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-semibold leading-6 text-zinc-950">Aeris chat</h2>
            <p className="max-w-2xl text-sm leading-6 text-zinc-600">
              Ask about trends, efforts, and what your runs say over time.
            </p>
          </div>
          {demoAllowanceStatus?.enabled ? (
            <p className="text-xs font-medium leading-5 text-zinc-500">
              {formatDemoAllowanceStatus(demoAllowanceStatus)}
            </p>
          ) : null}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto bg-zinc-50/70 px-4 py-5 sm:px-6">
        {messages.length === 0 ? (
          <SuggestedPromptButtons
            disabled={isChatInputDisabled}
            onSelect={(prompt) => void submitMessage(prompt)}
            prompts={STARTER_PROMPTS}
          />
        ) : null}

        <MessageList
          messages={messages.filter(
            (message) => message.content !== "" || message.id === streamingMessageId,
          )}
          streamingMessageId={streamingMessageId}
        />

        {error ? <p className="text-sm font-medium text-red-700">{error}</p> : null}
        {isDemoFinished ? (
          <p className="rounded-md border border-zinc-200 bg-white px-4 py-3 text-sm font-medium leading-6 text-zinc-700">
            {DEMO_FINISHED_MESSAGE}
          </p>
        ) : null}
        {followUpPrompts.length > 0 && status === "idle" ? (
          <SuggestedPromptButtons
            disabled={isChatInputDisabled}
            onSelect={(prompt) => void submitMessage(prompt)}
            prompts={followUpPrompts}
          />
        ) : null}
        <div ref={scrollAnchorRef} />
      </div>

      <ChatInput
        disabled={isChatInputDisabled}
        value={draft}
        onChange={setDraft}
        onSubmit={() => void submitMessage(draft)}
      />
    </section>
  );
}

function createChatExchange(content: string): {
  userMessage: ChatMessage;
  assistantMessage: ChatMessage;
} {
  return {
    userMessage: {
      id: crypto.randomUUID(),
      role: "user",
      content,
    },
    assistantMessage: {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "",
    },
  };
}

function buildChatHistory(messages: ChatMessage[]): ChatHistoryMessage[] {
  return messages
    .filter((message) => message.content.trim().length > 0)
    .slice(-MAX_CHAT_HISTORY_MESSAGES)
    .map(({ role, content }) => ({ role, content }));
}

function SuggestedPromptButtons({
  disabled,
  onSelect,
  prompts,
}: {
  disabled: boolean;
  onSelect(prompt: string): void;
  prompts: string[];
}) {
  return (
    <div
      aria-label="Suggested prompts"
      className="flex gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible sm:pb-0"
    >
      {prompts.map((prompt) => (
        <button
          aria-label={`Quick reply: ${prompt}`}
          className="shrink-0 rounded-md border border-zinc-200 bg-white px-4 py-2 text-left text-sm font-medium leading-5 text-zinc-800 shadow-sm shadow-zinc-200/70 transition-[border-color,box-shadow,color] duration-200 hover:border-sky-400 hover:text-zinc-950 hover:shadow-sky-100 focus-visible:border-sky-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-100 disabled:cursor-not-allowed disabled:text-zinc-400 motion-reduce:transition-none"
          disabled={disabled}
          key={prompt}
          type="button"
          onClick={() => onSelect(prompt)}
        >
          {prompt}
        </button>
      ))}
    </div>
  );
}

function uniquePrompts(prompts: string[], excludedPrompts: string[] = []): string[] {
  const seen = new Set(excludedPrompts.map(normalizePrompt));

  return prompts.filter((prompt) => {
    const trimmedPrompt = prompt.trim();
    const key = normalizePrompt(trimmedPrompt);

    if (trimmedPrompt.length === 0 || seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function uniquePromptHistory(prompts: string[]): string[] {
  return uniquePrompts(prompts);
}

function normalizePrompt(prompt: string): string {
  return prompt.trim().toLowerCase();
}

function isDemoAllowanceFinished(status: DemoAllowanceStatus | null): boolean {
  return Boolean(status?.enabled && status.availability === "available" && status.exhausted);
}

function buildFinishedDemoAllowanceStatus(
  status: DemoAllowanceStatus | null,
): DemoAllowanceStatus {
  return {
    enabled: true,
    limit: status?.limit ?? 1,
    remaining: 0,
    exhausted: true,
    availability: "available",
  };
}

function formatDemoAllowanceStatus(status: DemoAllowanceStatus): string {
  if (status.availability === "unavailable") {
    return "Public demo unavailable";
  }

  if (status.exhausted) {
    return "Public demo complete";
  }

  const turnLabel = status.remaining === 1 ? "turn" : "turns";
  return `Public demo: ${status.remaining} ${turnLabel} left`;
}

async function readDemoAllowanceStatus(): Promise<DemoAllowanceStatus | null> {
  try {
    const response = await fetch("/api/demo-allowance/status");

    if (!response.ok) {
      return null;
    }

    const parsedStatus = DemoAllowanceStatusSchema.safeParse(await response.json());

    return parsedStatus.success ? parsedStatus.data : null;
  } catch {
    return null;
  }
}

async function sendChatMessage({
  excludedSuggestions,
  message,
  history,
  onDelta,
  onSuggestions,
}: {
  excludedSuggestions: string[];
  message: string;
  history: ChatHistoryMessage[];
  onDelta(delta: string): void;
  onSuggestions(suggestions: string[]): void;
}): Promise<string | null> {
  const payload = {
    message,
    history,
    ...(excludedSuggestions.length > 0 ? { excludedSuggestions } : {}),
  };

  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new ChatRequestError(response.status, await readErrorMessage(response));
  }

  for await (const event of readSseEvents(response)) {
    if (event.delta) {
      onDelta(event.delta);
    }

    if (event.error) {
      return event.error;
    }

    if (event.suggestions) {
      onSuggestions(event.suggestions);
    }

    if (event.done) {
      return null;
    }
  }

  return null;
}

class ChatRequestError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ChatRequestError";
    this.status = status;
  }
}

async function readErrorMessage(response: Response): Promise<string> {
  const contentType = response.headers.get("Content-Type") ?? "";

  if (contentType.toLowerCase().includes("json")) {
    const body: unknown = await response.json();

    if (body && typeof body === "object" && "error" in body && typeof body.error === "string") {
      return body.error;
    }
  }

  const text = await response.text();
  return text.trim() || "Something went wrong. Please try again.";
}

async function* readSseEvents(response: Response): AsyncIterable<StreamEvent> {
  const reader = response.body?.getReader();

  if (!reader) {
    throw new Error("Chat stream did not include a response body.");
  }

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
      const parsed = parseSseEvent(event);

      if (parsed) {
        yield parsed;
      }
    }
  }

  const parsed = parseSseEvent(buffer + decoder.decode());

  if (parsed) {
    yield parsed;
  }
}

function parseSseEvent(event: string): StreamEvent | null {
  const dataLine = event
    .split("\n")
    .find((line) => line.startsWith("data:"));

  if (!dataLine) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(dataLine.replace(/^data:\s*/, ""));
    const streamEvent = StreamEventSchema.safeParse(parsed);

    return streamEvent.success ? streamEvent.data : null;
  } catch {
    return null;
  }
}
