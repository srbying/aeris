"use client";

import type { ReactNode } from "react";

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
          {message.role === "assistant" ? (
            <AssistantMarkdown content={message.content} />
          ) : (
            <p className="whitespace-pre-wrap">{message.content}</p>
          )}
        </article>
      ))}
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
