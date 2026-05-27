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
    return <p className="whitespace-pre-wrap">{body}</p>;
  }

  if (isStreaming && body === THINKING_MESSAGE) {
    return <p className="text-zinc-500">{body}</p>;
  }

  return (
    <div>
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
    const token = findNextInlineToken(text, cursor);

    if (!token) {
      nodes.push(text.slice(cursor));
      break;
    }

    const end = findClosingInlineToken(text, token);

    if (end === -1) {
      nodes.push(text.slice(cursor));
      break;
    }

    if (token.start > cursor) {
      nodes.push(text.slice(cursor, token.start));
    }

    const inlineText = text.slice(token.start + token.marker.length, end);

    if (inlineText.length === 0) {
      nodes.push(text.slice(token.start, end + token.marker.length));
      cursor = end + token.marker.length;
      continue;
    }

    nodes.push(renderInlineToken(token, inlineText, `${keyPrefix}-${segmentIndex}`));
    segmentIndex += 1;
    cursor = end + token.marker.length;
  }

  return nodes;
}

type InlineToken = {
  start: number;
  marker: "**" | "*" | "`";
};

function findNextInlineToken(text: string, cursor: number): InlineToken | null {
  for (let index = cursor; index < text.length; index += 1) {
    if (text.startsWith("**", index)) {
      return { start: index, marker: "**" };
    }

    if (text[index] === "`") {
      return { start: index, marker: "`" };
    }

    if (text[index] === "*" && !text.startsWith("**", index)) {
      return { start: index, marker: "*" };
    }
  }

  return null;
}

function findClosingInlineToken(text: string, token: InlineToken): number {
  const start = token.start + token.marker.length;

  if (token.marker !== "*") {
    return text.indexOf(token.marker, start);
  }

  for (let index = start; index < text.length; index += 1) {
    if (text[index] === "*" && !text.startsWith("**", index)) {
      return index;
    }
  }

  return -1;
}

function renderInlineToken(token: InlineToken, text: string, key: string): ReactNode {
  if (token.marker === "**") {
    return (
      <strong className="font-semibold text-zinc-950" key={key}>
        {text}
      </strong>
    );
  }

  if (token.marker === "*") {
    return (
      <em className="italic text-zinc-900" key={key}>
        {text}
      </em>
    );
  }

  return (
    <code
      className="rounded bg-zinc-100 px-1 py-0.5 font-mono text-[0.92em] text-zinc-950"
      key={key}
    >
      {text}
    </code>
  );
}
