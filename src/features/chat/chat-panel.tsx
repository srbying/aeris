"use client";

import { useState } from "react";
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
  })
  .strict();

type StreamEvent = z.infer<typeof StreamEventSchema>;
type ChatHistoryMessage = Pick<ChatMessage, "role" | "content">;

const STARTER_PROMPTS = [
  "Am I getting faster at the same heart rate?",
  "Which run had my best pace-to-HR ratio?",
  "How has my VO2 max changed over 6 months?",
];

export function ChatPanel() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState<ChatStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);

  async function submitMessage(message: string) {
    const trimmedMessage = message.trim();

    if (!trimmedMessage || status === "streaming") {
      return;
    }

    const { userMessage, assistantMessage } = createChatExchange(trimmedMessage);
    const history = buildChatHistory(messages);

    setMessages((currentMessages) => [...currentMessages, userMessage, assistantMessage]);
    setDraft("");
    setStatus("streaming");
    setStreamingMessageId(assistantMessage.id);
    setError(null);

    try {
      const streamError = await sendChatMessage({
        message: trimmedMessage,
        history,
        onDelta: (delta) => appendAssistantDelta(assistantMessage.id, delta),
      });

      if (streamError) {
        setError(streamError);
      }
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Chat failed.");
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

  return (
    <section
      aria-label="Aeris chat window"
      className="flex h-full min-h-[280px] w-full flex-col overflow-hidden rounded-lg border border-zinc-200/80 bg-white shadow-[0_18px_48px_rgba(15,23,42,0.08)]"
    >
      <div className="border-b border-zinc-200/80 bg-white px-4 py-4 sm:px-6">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold leading-6 text-zinc-950">Aeris chat</h2>
          <p className="max-w-2xl text-sm leading-6 text-zinc-600">
            Ask about trends, efforts, and what your runs say over time.
          </p>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto bg-zinc-50/70 px-4 py-5 sm:px-6">
        {messages.length === 0 ? (
          <StarterPromptButtons
            disabled={status === "streaming"}
            onSelect={(prompt) => void submitMessage(prompt)}
          />
        ) : null}

        <MessageList
          messages={messages.filter(
            (message) => message.content !== "" || message.id === streamingMessageId,
          )}
          streamingMessageId={streamingMessageId}
        />

        {error ? <p className="text-sm font-medium text-red-700">{error}</p> : null}
      </div>

      <ChatInput
        disabled={status === "streaming"}
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

function StarterPromptButtons({
  disabled,
  onSelect,
}: {
  disabled: boolean;
  onSelect(prompt: string): void;
}) {
  return (
    <div
      aria-label="Starter prompts"
      className="flex gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible sm:pb-0"
    >
      {STARTER_PROMPTS.map((prompt) => (
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

async function sendChatMessage({
  message,
  history,
  onDelta,
}: {
  message: string;
  history: ChatHistoryMessage[];
  onDelta(delta: string): void;
}): Promise<string | null> {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, history }),
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  for await (const event of readSseEvents(response)) {
    if (event.delta) {
      onDelta(event.delta);
    }

    if (event.error) {
      return event.error;
    }

    if (event.done) {
      return null;
    }
  }

  return null;
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
