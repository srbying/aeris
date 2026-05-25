import { NextResponse } from "next/server";
import { z } from "zod";
import { buildChatContext } from "../../../lib/llm/context";
import {
  getChatActivityRepository,
  getChatProvider,
} from "../../../lib/llm/dependencies";
import { buildAerisSystemPrompt } from "../../../lib/llm/prompts";
import type { LLMMessage } from "../../../lib/llm/types";

export const runtime = "edge";
export const dynamic = "force-dynamic";

const MAX_CHAT_MESSAGE_LENGTH = 2000;
const MAX_CHAT_HISTORY_MESSAGES = 10;

const chatRequestSchema = z.object({
  message: z
    .string()
    .trim()
    .min(1, "message is required")
    .max(MAX_CHAT_MESSAGE_LENGTH, "message must be 2000 characters or fewer"),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z
          .string()
          .trim()
          .min(1, "history content is required")
          .max(MAX_CHAT_MESSAGE_LENGTH, "history content must be 2000 characters or fewer"),
      }),
    )
    .max(MAX_CHAT_HISTORY_MESSAGES, "history must include 10 messages or fewer")
    .default([]),
});

export async function POST(request: Request): Promise<Response> {
  const parsedRequest = await parseChatRequest(request);

  if (!parsedRequest.success) {
    return NextResponse.json({ error: parsedRequest.error }, { status: 400 });
  }

  try {
    const repository = getChatActivityRepository();
    const context = await buildChatContext({ repository });

    if (context.activityCount === 0) {
      return NextResponse.json(
        { error: "Upload your Garmin data to start chatting with Aeris." },
        { status: 409 },
      );
    }

    const provider = getChatProvider();
    const messages: LLMMessage[] = [
      { role: "system", content: buildAerisSystemPrompt(context) },
      ...parsedRequest.data.history,
      { role: "user", content: parsedRequest.data.message },
    ];

    return streamSse(provider.stream({ messages, signal: request.signal }));
  } catch {
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 },
    );
  }
}

async function parseChatRequest(
  request: Request,
): Promise<
  | { success: true; data: z.infer<typeof chatRequestSchema> }
  | { success: false; error: string }
> {
  try {
    const body: unknown = await request.json();
    const parsed = chatRequestSchema.safeParse(body);

    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues[0]?.message ?? "Invalid chat request.",
      };
    }

    return { success: true, data: parsed.data };
  } catch {
    return { success: false, error: "Invalid JSON request body." };
  }
}

function streamSse(deltas: AsyncIterable<string> | Iterable<string>): Response {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const delta of deltas) {
          controller.enqueue(encoder.encode(toSseEvent({ delta })));
        }

        controller.enqueue(encoder.encode(toSseEvent({ done: true })));
      } catch {
        controller.enqueue(
          encoder.encode(toSseEvent({ error: "Something went wrong. Please try again." })),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
    },
  });
}

function toSseEvent(payload: Record<string, string | boolean>): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}
