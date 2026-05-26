import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChatPanel } from "./chat-panel";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function streamingResponse(events: Array<Record<string, unknown>>): Response {
  const encoder = new TextEncoder();

  return new Response(
    new ReadableStream({
      start(controller) {
        for (const event of events) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        }
        controller.close();
      },
    }),
    {
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
    },
  );
}

describe("ChatPanel", () => {
  it("renders a focused chat window with concise ask-help and persistent custom input", () => {
    render(<ChatPanel />);

    const chatWindow = screen.getByRole("region", { name: /aeris chat window/i });

    expect(chatWindow).toBeTruthy();
    expect(chatWindow.textContent).toContain("Ask about trends, efforts, and what your runs say over time.");
    expect(screen.getByRole("textbox", { name: /message/i })).toBeTruthy();
  });

  it("shows starter prompts as quick-reply actions when the thread is empty", () => {
    render(<ChatPanel />);

    expect(
      screen.getByRole("button", { name: /quick reply: am i getting faster at the same heart rate/i }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: /quick reply: which run had my best pace-to-HR ratio/i })).toBeTruthy();
  });

  it("submits a message and streams assistant deltas into the thread", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      streamingResponse([{ delta: "You are " }, { delta: "getting faster." }, { done: true }]),
    );

    render(<ChatPanel />);

    fireEvent.change(screen.getByRole("textbox", { name: /message/i }), {
      target: { value: "Am I getting faster?" },
    });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));

    expect(screen.getByText("Am I getting faster?")).toBeTruthy();

    await waitFor(() => {
      expect(screen.getByText("You are getting faster.")).toBeTruthy();
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/chat",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }),
    );
  });

  it("submits a starter prompt through the same chat flow while keeping custom input available", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      streamingResponse([{ delta: "Your aerobic efficiency is improving." }, { done: true }]),
    );

    render(<ChatPanel />);

    fireEvent.click(
      screen.getByRole("button", {
        name: /quick reply: am i getting faster at the same heart rate/i,
      }),
    );

    expect(screen.getByRole("textbox", { name: /message/i })).toBeTruthy();
    expect(screen.getByText("Am I getting faster at the same heart rate?")).toBeTruthy();

    await waitFor(() => {
      expect(screen.getByText("Your aerobic efficiency is improving.")).toBeTruthy();
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/chat",
      expect.objectContaining({
        body: JSON.stringify({
          message: "Am I getting faster at the same heart rate?",
          history: [],
        }),
      }),
    );
  });

  it("shows a server error while preserving any partial streamed response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      streamingResponse([
        { delta: "Here is what I can tell so far." },
        { error: "Response interrupted. Here's what I had so far..." },
      ]),
    );

    render(<ChatPanel />);

    fireEvent.change(screen.getByRole("textbox", { name: /message/i }), {
      target: { value: "How am I doing?" },
    });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() => {
      expect(screen.getByText("Here is what I can tell so far.")).toBeTruthy();
      expect(screen.getByText(/response interrupted/i)).toBeTruthy();
    });
  });

  it("ignores SSE events that do not match the stream event shape", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      streamingResponse([{ delta: 123 }, { delta: "Valid answer." }, { done: true }]),
    );

    render(<ChatPanel />);

    fireEvent.change(screen.getByRole("textbox", { name: /message/i }), {
      target: { value: "How am I doing?" },
    });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() => {
      expect(screen.getByText("Valid answer.")).toBeTruthy();
    });
  });

  it("does not send empty assistant placeholders in request history", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(() => Promise.resolve(streamingResponse([{ done: true }])));

    render(<ChatPanel />);

    fireEvent.change(screen.getByRole("textbox", { name: /message/i }), {
      target: { value: "First question" },
    });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    fireEvent.change(screen.getByRole("textbox", { name: /message/i }), {
      target: { value: "Second question" },
    });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    const [, secondRequest] = fetchMock.mock.calls[1];
    const body = JSON.parse(String(secondRequest?.body)) as {
      history: Array<{ role: string; content: string }>;
    };

    expect(body.history).toEqual([{ role: "user", content: "First question" }]);
  });
});
