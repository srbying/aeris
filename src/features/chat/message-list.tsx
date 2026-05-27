"use client";

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

type MessageListProps = {
  messages: ChatMessage[];
  streamingMessageId?: string | null;
};

const THINKING_MESSAGE = "Aeris is reading the run history...";

export function MessageList({ messages, streamingMessageId = null }: MessageListProps) {
  if (messages.length === 0) {
    return null;
  }

  return (
    <div aria-live="polite" className="flex flex-col gap-6">
      {messages.map((message) => {
        const isUser = message.role === "user";
        const isStreaming = message.id === streamingMessageId;
        const roleLabel = isUser ? "You" : "Aeris";
        const body = message.content || (isStreaming ? THINKING_MESSAGE : "");

        return (
          <article
            aria-busy={isStreaming}
            aria-label={`${roleLabel} turn`}
            className={
              isUser
                ? "ml-auto flex max-w-[82%] flex-col gap-2 rounded-lg border border-zinc-200 border-r-zinc-950 bg-white px-4 py-4 text-right text-sm leading-6 text-zinc-950 shadow-sm shadow-zinc-200/70 sm:max-w-[76%]"
                : "mr-auto flex max-w-[92%] flex-col gap-2 rounded-lg border border-zinc-200 border-l-sky-500 bg-white px-4 py-4 text-sm leading-6 text-zinc-800 shadow-sm shadow-sky-950/5 sm:max-w-[86%]"
            }
            key={message.id}
          >
            <p
              className={
                isUser
                  ? "text-xs font-semibold uppercase leading-4 text-zinc-500"
                  : "text-xs font-semibold uppercase leading-4 text-sky-700"
              }
            >
              {roleLabel}
            </p>
            <p
              className={
                isStreaming && !message.content
                  ? "text-zinc-500"
                  : "whitespace-pre-wrap"
              }
            >
              {body}
            </p>
          </article>
        );
      })}
    </div>
  );
}
