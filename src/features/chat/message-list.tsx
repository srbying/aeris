"use client";

import type { ReactNode } from "react";

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
                ? "ml-auto max-w-[82%] border-r-2 border-zinc-950 bg-zinc-100/70 px-4 py-4 text-right text-sm leading-6 text-zinc-950 sm:max-w-[76%]"
                : "mr-auto max-w-[92%] border-l-2 border-sky-500 bg-white px-4 py-4 text-sm leading-6 text-zinc-800 shadow-sm shadow-zinc-200/50 sm:max-w-[86%]"
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
            <MessageBody body={body} isStreaming={isStreaming} isUser={isUser} />
          </article>
        );
      })}
    </div>
  );
}

function MessageBody({
  body,
  isStreaming,
  isUser,
}: {
  body: string;
  isStreaming: boolean;
  isUser: boolean;
}) {
  if (isUser) {
    return <p className="whitespace-pre-wrap pt-2">{body}</p>;
  }

  if (isStreaming && body === THINKING_MESSAGE) {
    return <p className="pt-2 text-zinc-500">{body}</p>;
  }

  return (
    <div className="pt-2">
      <AssistantMarkdown content={body} />
    </div>
  );
}

type MarkdownBlock =
  | {
      type: "paragraph";
      text: string;
    }
  | {
      type: "list";
      items: string[];
    };

function AssistantMarkdown({ content }: { content: string }) {
  const blocks = parseLightMarkdown(content);

  return (
    <div className="space-y-2">
      {blocks.map((block, blockIndex) =>
        block.type === "list" ? (
          <ul className="list-disc space-y-2 pl-4" key={`list-${blockIndex}`}>
            {block.items.map((item, itemIndex) => (
              <li key={`${blockIndex}-${itemIndex}`}>
                {renderInlineMarkdown(item, `list-${blockIndex}-${itemIndex}`)}
              </li>
            ))}
          </ul>
        ) : (
          <p key={`paragraph-${blockIndex}`}>
            {renderInlineMarkdown(block.text, `paragraph-${blockIndex}`)}
          </p>
        ),
      )}
    </div>
  );
}

function parseLightMarkdown(content: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  let paragraphLines: string[] = [];
  let listItems: string[] = [];

  function flushParagraph() {
    if (paragraphLines.length === 0) {
      return;
    }

    blocks.push({
      type: "paragraph",
      text: paragraphLines.join(" "),
    });
    paragraphLines = [];
  }

  function flushList() {
    if (listItems.length === 0) {
      return;
    }

    blocks.push({
      type: "list",
      items: listItems,
    });
    listItems = [];
  }

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    const bullet = line.match(/^[-*]\s+(.+)$/);

    if (line.length === 0) {
      flushParagraph();
      flushList();
      continue;
    }

    if (bullet) {
      flushParagraph();
      listItems.push(bullet[1]);
      continue;
    }

    flushList();
    paragraphLines.push(line);
  }

  flushParagraph();
  flushList();

  return blocks;
}

function renderInlineMarkdown(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let cursor = 0;
  let segmentIndex = 0;

  while (cursor < text.length) {
    const start = text.indexOf("**", cursor);

    if (start === -1) {
      nodes.push(text.slice(cursor));
      break;
    }

    const end = text.indexOf("**", start + 2);

    if (end === -1) {
      nodes.push(text.slice(cursor));
      break;
    }

    if (start > cursor) {
      nodes.push(text.slice(cursor, start));
    }

    const strongText = text.slice(start + 2, end);

    if (strongText.length === 0) {
      nodes.push(text.slice(start, end + 2));
      cursor = end + 2;
      continue;
    }

    nodes.push(
      <strong className="font-semibold text-zinc-950" key={`${keyPrefix}-${segmentIndex}`}>
        {strongText}
      </strong>,
    );
    segmentIndex += 1;
    cursor = end + 2;
  }

  return nodes;
}
