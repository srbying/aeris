import { NextResponse } from "next/server";
import { z } from "zod";
import {
  buildDemoVisitorCookie,
  consumeDemoChatTurn,
  DEMO_VISITOR_COOKIE_NAME,
} from "../../../lib/demo/demo-allowance";
import {
  generateDemoVisitorToken,
  getDemoAllowanceRepository,
} from "../../../lib/demo/dependencies";
import { buildChatContext } from "../../../lib/llm/context";
import {
  getChatActivityRepository,
  getChatProvider,
} from "../../../lib/llm/dependencies";
import { buildAerisSystemPrompt } from "../../../lib/llm/prompts";
import type { LLMMessage } from "../../../lib/llm/types";
import { resolveDisplayUnitSystem } from "../../../lib/measurements/formatters";

export const runtime = "edge";
export const dynamic = "force-dynamic";

const MAX_CHAT_MESSAGE_LENGTH = 2000;
const MAX_CHAT_HISTORY_MESSAGES = 10;
const MAX_EXCLUDED_SUGGESTIONS = 20;
const MAX_SUGGESTION_LENGTH = 160;
const MAX_FOLLOW_UP_SUGGESTIONS = 3;
const STREAM_INTERRUPTED_MESSAGE = "Response interrupted. Please retry your question.";

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
  excludedSuggestions: z
    .array(
      z
        .string()
        .trim()
        .min(1, "excluded suggestion is required")
        .max(MAX_SUGGESTION_LENGTH, "excluded suggestion must be 160 characters or fewer"),
    )
    .max(
      MAX_EXCLUDED_SUGGESTIONS,
      "excludedSuggestions must include 20 suggestions or fewer",
    )
    .default([]),
});

const followUpSuggestionsSchema = z.union([
  z.object({
    suggestions: z.array(z.string()),
  }),
  z.array(z.string()),
]);

export async function POST(request: Request): Promise<Response> {
  const parsedRequest = await parseChatRequest(request);

  if (!parsedRequest.success) {
    return NextResponse.json({ error: parsedRequest.error }, { status: 400 });
  }

  try {
    const repository = getChatActivityRepository();
    const unitSystem = resolveDisplayUnitSystem({
      currentMessage: parsedRequest.data.message,
      history: parsedRequest.data.history,
    });
    const context = await buildChatContext({
      repository,
      question: parsedRequest.data.message,
      history: parsedRequest.data.history,
      unitSystem,
    });

    if (context.activityCount === 0) {
      return NextResponse.json(
        { error: "Upload your Garmin data to start chatting with Aeris." },
        { status: 409 },
      );
    }

    const demoTurnDecision = await consumeDemoChatTurn({
      generateVisitorToken: generateDemoVisitorToken,
      repository: getDemoAllowanceRepository(),
      visitorToken: getCookieValue(request, DEMO_VISITOR_COOKIE_NAME),
    });

    if (!demoTurnDecision.allowed) {
      if (demoTurnDecision.reason === "exhausted") {
        return NextResponse.json(
          { error: "Public demo chat allowance is finished." },
          { status: 429 },
        );
      }

      return NextResponse.json(
        { error: "Public demo chat is temporarily unavailable. Please try again later." },
        { status: 503 },
      );
    }

    const provider = getChatProvider();
    const messages: LLMMessage[] = [
      { role: "system", content: buildAerisSystemPrompt(context) },
      ...parsedRequest.data.history,
      { role: "user", content: parsedRequest.data.message },
    ];

    let deltas: AsyncIterable<string> | Iterable<string>;

    try {
      deltas = provider.stream({ messages, signal: request.signal });
    } catch {
      const response = NextResponse.json(
        { error: "Aeris could not reach the AI provider. Please try again." },
        { status: 502 },
      );
      applyDemoVisitorCookie(response, demoTurnDecision.visitorTokenToSet);
      return response;
    }

    const response = streamSse({
      deltas,
      excludedSuggestions: parsedRequest.data.excludedSuggestions,
      history: parsedRequest.data.history,
      provider,
      question: parsedRequest.data.message,
      signal: request.signal,
    });
    applyDemoVisitorCookie(response, demoTurnDecision.visitorTokenToSet);
    return response;
  } catch {
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 },
    );
  }
}

function getCookieValue(request: Request, name: string): string | null {
  const cookieHeader = request.headers.get("Cookie") ?? request.headers.get("cookie");

  if (!cookieHeader) {
    return null;
  }

  for (const cookie of cookieHeader.split(";")) {
    const [rawName, ...rawValueParts] = cookie.trim().split("=");

    if (rawName === name) {
      return decodeURIComponent(rawValueParts.join("="));
    }
  }

  return null;
}

function applyDemoVisitorCookie(
  response: NextResponse,
  visitorTokenToSet: string | null,
): void {
  if (visitorTokenToSet === null) {
    return;
  }

  response.cookies.set(buildDemoVisitorCookie(visitorTokenToSet));
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

function streamSse({
  deltas,
  excludedSuggestions,
  history,
  provider,
  question,
  signal,
}: {
  deltas: AsyncIterable<string> | Iterable<string>;
  excludedSuggestions: string[];
  history: LLMMessage[];
  provider: ReturnType<typeof getChatProvider>;
  question: string;
  signal?: AbortSignal;
}): NextResponse {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let assistantAnswer = "";

      try {
        for await (const delta of deltas) {
          assistantAnswer += delta;
          controller.enqueue(encoder.encode(toSseEvent({ delta })));
        }

        const suggestions = await generateFollowUpSuggestions({
          answer: assistantAnswer,
          excludedSuggestions,
          history,
          provider,
          question,
          signal,
        });

        if (suggestions.length > 0) {
          controller.enqueue(encoder.encode(toSseEvent({ suggestions })));
        }

        controller.enqueue(encoder.encode(toSseEvent({ done: true })));
      } catch {
        controller.enqueue(
          encoder.encode(toSseEvent({ error: STREAM_INTERRUPTED_MESSAGE })),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
    },
  });
}

async function generateFollowUpSuggestions({
  answer,
  excludedSuggestions,
  history,
  provider,
  question,
  signal,
}: {
  answer: string;
  excludedSuggestions: string[];
  history: LLMMessage[];
  provider: ReturnType<typeof getChatProvider>;
  question: string;
  signal?: AbortSignal;
}): Promise<string[]> {
  if (answer.trim().length === 0) {
    return [];
  }

  try {
    const rawSuggestions = await collectStreamText(
      provider.stream({
        messages: buildFollowUpSuggestionMessages({
          answer,
          excludedSuggestions,
          history,
          question,
        }),
        signal,
      }),
    );

    return parseFollowUpSuggestions(rawSuggestions, excludedSuggestions);
  } catch {
    return [];
  }
}

function buildFollowUpSuggestionMessages({
  answer,
  excludedSuggestions,
  history,
  question,
}: {
  answer: string;
  excludedSuggestions: string[];
  history: LLMMessage[];
  question: string;
}): LLMMessage[] {
  return [
    {
      role: "system",
      content: [
        "You generate concise follow-up questions for Aeris, a running analytics chat.",
        "Return JSON only, with shape {\"suggestions\":[\"question 1\",\"question 2\",\"question 3\"]}.",
        "Generate exactly 3 user-clickable follow-up questions when possible.",
        "Use only the supplied conversation context. Do not invent run details.",
        "Do not suggest coaching recommendations or training plans.",
        "Do not repeat any excluded suggestion exactly.",
      ].join("\n"),
    },
    {
      role: "user",
      content: JSON.stringify({
        latestQuestion: question,
        assistantAnswer: answer,
        recentHistory: history.slice(-6),
        excludedSuggestions,
      }),
    },
  ];
}

async function collectStreamText(deltas: AsyncIterable<string> | Iterable<string>): Promise<string> {
  let content = "";

  for await (const delta of deltas) {
    content += delta;
  }

  return content;
}

function parseFollowUpSuggestions(rawValue: string, excludedSuggestions: string[]): string[] {
  const trimmedValue = rawValue.trim();

  if (trimmedValue.length === 0) {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(stripJsonFence(trimmedValue));
    const suggestionResult = followUpSuggestionsSchema.safeParse(parsed);

    if (!suggestionResult.success) {
      return [];
    }

    const suggestions = Array.isArray(suggestionResult.data)
      ? suggestionResult.data
      : suggestionResult.data.suggestions;
    const excluded = new Set(excludedSuggestions.map(normalizeSuggestion));
    const seen = new Set<string>();

    return suggestions
      .map((suggestion) => suggestion.trim())
      .filter((suggestion) => isAllowedSuggestion(suggestion, excluded, seen))
      .slice(0, MAX_FOLLOW_UP_SUGGESTIONS);
  } catch {
    return [];
  }
}

function stripJsonFence(value: string): string {
  return value.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
}

function isAllowedSuggestion(
  suggestion: string,
  excluded: Set<string>,
  seen: Set<string>,
): boolean {
  const normalized = normalizeSuggestion(suggestion);

  if (
    suggestion.length === 0 ||
    suggestion.length > MAX_SUGGESTION_LENGTH ||
    excluded.has(normalized) ||
    seen.has(normalized) ||
    /\b(coach|coaching|training plan|workout plan|recommendation|recommend)\b/i.test(
      suggestion,
    )
  ) {
    return false;
  }

  seen.add(normalized);
  return true;
}

function normalizeSuggestion(value: string): string {
  return value.trim().toLowerCase();
}

function toSseEvent(payload: Record<string, string | boolean | string[]>): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}
