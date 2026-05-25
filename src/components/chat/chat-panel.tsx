"use client";

import { useState } from "react";
import { ChatInput } from "./chat-input";
import { type ChatMessage, MessageList } from "./message-list";

type ChatStatus = "idle" | "streaming";

type StreamEvent = {
  delta?: string;
  done?: boolean;
  error?: string;
};

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

  async function submitMessage(message: string) {
    const trimmedMessage = message.trim();

    if (!trimmedMessage || status === "streaming") {
      return;
    }

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: trimmedMessage,
    };
    const assistantMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "",
    };
    const history = messages.map(({ role, content }) => ({ role, content }));

    setMessages((currentMessages) => [...currentMessages, userMessage, assistantMessage]);
    setDraft("");
    setStatus("streaming");
    setError(null);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmedMessage,
          history,
        }),
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      for await (const event of readSseEvents(response)) {
        if (event.delta) {
          appendAssistantDelta(assistantMessage.id, event.delta);
        }

        if (event.error) {
          setError(event.error);
          break;
        }

        if (event.done) {
          break;
        }
      }
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Chat failed.");
    } finally {
      setStatus("idle");
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
    <section className="w-full border border-zinc-200 bg-zinc-50 p-6">
      <div className="mb-5">
        <h2 className="text-lg font-semibold text-zinc-950">Aeris chat</h2>
      </div>

      {messages.length === 0 ? (
        <div className="mb-4 flex flex-wrap gap-2">
          {STARTER_PROMPTS.map((prompt) => (
            <button
              className="border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-800 transition hover:border-zinc-950 disabled:cursor-not-allowed disabled:text-zinc-400"
              disabled={status === "streaming"}
              key={prompt}
              type="button"
              onClick={() => void submitMessage(prompt)}
            >
              {prompt}
            </button>
          ))}
        </div>
      ) : null}

      <MessageList messages={messages.filter((message) => message.content !== "")} />

      {error ? <p className="mt-4 text-sm font-medium text-red-700">{error}</p> : null}

      <ChatInput
        disabled={status === "streaming"}
        value={draft}
        onChange={setDraft}
        onSubmit={() => void submitMessage(draft)}
      />
    </section>
  );
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
    return JSON.parse(dataLine.replace(/^data:\s*/, "")) as StreamEvent;
  } catch {
    return null;
  }
}
