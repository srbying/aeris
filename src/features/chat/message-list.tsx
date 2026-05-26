"use client";

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

type MessageListProps = {
  messages: ChatMessage[];
};

export function MessageList({ messages }: MessageListProps) {
  if (messages.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-4">
      {messages.map((message) => (
        <article
          className={
            message.role === "user"
              ? "self-end bg-zinc-950 px-4 py-2 text-sm text-white"
              : "self-start border border-zinc-200 bg-white px-4 py-2 text-sm text-zinc-800"
          }
          key={message.id}
        >
          <p className="whitespace-pre-wrap">{message.content}</p>
        </article>
      ))}
    </div>
  );
}
