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
    <div aria-live="polite" className="flex flex-col gap-5">
      {messages.map((message) => (
        <article
          className={
            message.role === "user"
              ? "ml-auto max-w-[84%] border-r-2 border-zinc-950 bg-zinc-950/5 px-4 py-3 text-sm leading-6 text-zinc-950"
              : "mr-auto max-w-[88%] border-l-2 border-sky-500 bg-white px-4 py-3 text-sm leading-6 text-zinc-800 shadow-sm shadow-zinc-200/60"
          }
          key={message.id}
        >
          <p className="whitespace-pre-wrap">{message.content}</p>
        </article>
      ))}
    </div>
  );
}
