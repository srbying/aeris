import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChatPanel } from "./chat-panel";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
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

function pendingStreamingResponse(): {
  response: Response;
  send(event: Record<string, unknown>): void;
  close(): void;
} {
  const encoder = new TextEncoder();
  let streamController: ReadableStreamDefaultController<Uint8Array> | null = null;

  const response = new Response(
    new ReadableStream({
      start(controller) {
        streamController = controller;
      },
    }),
    {
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
    },
  );

  return {
    response,
    send(event) {
      streamController?.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
    },
    close() {
      streamController?.close();
    },
  };
}

function mockScrollIntoView(): ReturnType<typeof vi.fn> {
  const scrollIntoView = vi.fn();

  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: scrollIntoView,
  });

  return scrollIntoView;
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
    expect(screen.getByText("You")).toBeTruthy();
    expect(screen.getByText("Aeris")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/chat",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }),
    );
  });

  it("renders the assistant thinking state as the active thread entry", async () => {
    const stream = pendingStreamingResponse();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(stream.response);

    render(<ChatPanel />);

    fireEvent.change(screen.getByRole("textbox", { name: /message/i }), {
      target: { value: "Compare this month to last month" },
    });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() => {
      expect(screen.getByText("Compare this month to last month")).toBeTruthy();
    });

    const threadEntries = screen.getAllByRole("article");

    expect(threadEntries).toHaveLength(2);
    expect(threadEntries[0]?.textContent).toContain("You");
    expect(threadEntries[1]?.textContent).toContain("Aeris");
    expect(threadEntries[1]?.textContent).toContain("Aeris is reading the run history...");

    stream.send({ done: true });
    stream.close();
  });

  it("scrolls to the bottom as assistant content streams", async () => {
    const stream = pendingStreamingResponse();
    const scrollIntoView = mockScrollIntoView();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(stream.response);

    render(<ChatPanel />);

    fireEvent.change(screen.getByRole("textbox", { name: /message/i }), {
      target: { value: "Compare this month to last month" },
    });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() => {
      expect(screen.getByText("Compare this month to last month")).toBeTruthy();
    });

    scrollIntoView.mockClear();
    stream.send({ delta: "You are trending faster." });

    await waitFor(() => {
      expect(screen.getByText("You are trending faster.")).toBeTruthy();
      expect(scrollIntoView).toHaveBeenCalledWith({ block: "end" });
    });

    stream.send({ done: true });
    stream.close();
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

  it("sends prior assistant answers in request history for follow-up drilldowns", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        streamingResponse([
          { delta: "**Directionally yes.** Recent similar-HR runs are faster." },
          { done: true },
        ]),
      )
      .mockResolvedValueOnce(streamingResponse([{ delta: "Raw details." }, { done: true }]));

    render(<ChatPanel />);

    fireEvent.change(screen.getByRole("textbox", { name: /message/i }), {
      target: { value: "Am I getting faster at the same heart rate?" },
    });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() => {
      expect(screen.getByText(/recent similar-HR runs are faster/i)).toBeTruthy();
    });

    fireEvent.change(screen.getByRole("textbox", { name: /message/i }), {
      target: { value: "Show the raw numbers behind that." },
    });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    const [, secondRequest] = fetchMock.mock.calls[1];
    const body = JSON.parse(String(secondRequest?.body)) as {
      history: Array<{ role: string; content: string }>;
    };

    expect(body.history).toEqual([
      { role: "user", content: "Am I getting faster at the same heart rate?" },
      {
        role: "assistant",
        content: "**Directionally yes.** Recent similar-HR runs are faster.",
      },
    ]);
  });

  it("shows contextual follow-up prompts after an assistant response completes", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      streamingResponse([
        { delta: "**Directionally yes.** Your aerobic efficiency is improving." },
        { done: true },
      ]),
    );

    render(<ChatPanel />);

    fireEvent.change(screen.getByRole("textbox", { name: /message/i }), {
      target: { value: "Am I getting faster at the same heart rate?" },
    });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() => {
      expect(
        screen.getByRole("button", {
          name: /quick reply: show the raw numbers behind that/i,
        }),
      ).toBeTruthy();
    });
    expect(
      screen.getByRole("button", {
        name: /quick reply: which older runs are you comparing that to/i,
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", {
        name: /quick reply: show the raw aerobic efficiency values/i,
      }),
    ).toBeTruthy();
  });

  it("sends a follow-up prompt immediately with prior chat history", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        streamingResponse([
          { delta: "**Directionally yes.** Your aerobic efficiency is improving." },
          { done: true },
        ]),
      )
      .mockResolvedValueOnce(streamingResponse([{ delta: "Raw details." }, { done: true }]));

    render(<ChatPanel />);

    fireEvent.change(screen.getByRole("textbox", { name: /message/i }), {
      target: { value: "Am I getting faster at the same heart rate?" },
    });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));

    const followUp = await screen.findByRole("button", {
      name: /quick reply: show the raw numbers behind that/i,
    });
    fireEvent.click(followUp);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    const [, secondRequest] = fetchMock.mock.calls[1];
    const body = JSON.parse(String(secondRequest?.body)) as {
      message: string;
      history: Array<{ role: string; content: string }>;
    };

    expect(body.message).toBe("Show the raw numbers behind that.");
    expect(body.history).toEqual([
      { role: "user", content: "Am I getting faster at the same heart rate?" },
      {
        role: "assistant",
        content: "**Directionally yes.** Your aerobic efficiency is improving.",
      },
    ]);
  });

  it("hides follow-up prompts while streaming and replaces them after the next answer", async () => {
    const secondStream = pendingStreamingResponse();
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        streamingResponse([
          { delta: "**Directionally yes.** Your aerobic efficiency is improving." },
          { done: true },
        ]),
      )
      .mockResolvedValueOnce(secondStream.response);

    render(<ChatPanel />);

    fireEvent.change(screen.getByRole("textbox", { name: /message/i }), {
      target: { value: "Am I getting faster at the same heart rate?" },
    });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));

    const rawNumbersPrompt = await screen.findByRole("button", {
      name: /quick reply: show the raw numbers behind that/i,
    });
    fireEvent.click(rawNumbersPrompt);

    await waitFor(() => {
      expect(
        screen.queryByRole("button", {
          name: /quick reply: show the raw numbers behind that/i,
        }),
      ).toBeNull();
    });

    secondStream.send({ delta: "Your VO2 max estimate changed most in May." });
    secondStream.send({ done: true });
    secondStream.close();

    await waitFor(() => {
      expect(
        screen.getByRole("button", {
          name: /quick reply: which dates changed the vo2 max estimate most/i,
        }),
      ).toBeTruthy();
    });
  });

  it("does not show follow-up prompts after an interrupted streamed response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      streamingResponse([
        { delta: "Here is a partial efficiency answer." },
        { error: "Response interrupted. Please retry your question." },
      ]),
    );

    render(<ChatPanel />);

    fireEvent.change(screen.getByRole("textbox", { name: /message/i }), {
      target: { value: "Am I getting faster at the same heart rate?" },
    });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() => {
      expect(screen.getByText(/response interrupted/i)).toBeTruthy();
    });
    expect(
      screen.queryByRole("button", {
        name: /quick reply: show the raw numbers behind that/i,
      }),
    ).toBeNull();
  });

  it("does not show follow-up prompts after a failed request", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "Upload your Garmin data to start chatting with Aeris." }), {
        status: 409,
        headers: { "Content-Type": "application/json" },
      }),
    );

    render(<ChatPanel />);

    fireEvent.change(screen.getByRole("textbox", { name: /message/i }), {
      target: { value: "Am I getting faster?" },
    });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() => {
      expect(screen.getByText(/upload your garmin data/i)).toBeTruthy();
    });
    expect(screen.queryByRole("button", { name: /quick reply: show the raw numbers/i })).toBeNull();
  });

  it("keeps follow-up history within the API cap while preserving the latest answer", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation((_url, init) => {
      const body = JSON.parse(String(init?.body)) as { message: string };

      return Promise.resolve(
        streamingResponse([{ delta: `Answer for ${body.message}` }, { done: true }]),
      );
    });

    render(<ChatPanel />);

    for (let index = 1; index <= 6; index += 1) {
      fireEvent.change(screen.getByRole("textbox", { name: /message/i }), {
        target: { value: `Question ${index}` },
      });
      fireEvent.click(screen.getByRole("button", { name: /send/i }));

      await waitFor(() => {
        expect(screen.getByText(`Answer for Question ${index}`)).toBeTruthy();
      });
    }

    fireEvent.change(screen.getByRole("textbox", { name: /message/i }), {
      target: { value: "Show the raw numbers behind that." },
    });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(7);
    });

    const [, finalRequest] = fetchMock.mock.calls[6];
    const body = JSON.parse(String(finalRequest?.body)) as {
      history: Array<{ role: string; content: string }>;
    };

    expect(body.history).toHaveLength(10);
    expect(body.history[0]).toEqual({ role: "user", content: "Question 2" });
    expect(body.history.at(-1)).toEqual({
      role: "assistant",
      content: "Answer for Question 6",
    });
  });
});
