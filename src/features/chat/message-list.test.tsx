import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MessageList } from "./message-list";

afterEach(() => {
  cleanup();
});

describe("MessageList", () => {
  it("renders assistant bold text and compact bullets as light Markdown", () => {
    render(
      <MessageList
        messages={[
          {
            id: "assistant-1",
            role: "assistant",
            content: "**Faster** at same effort.\n\n- Pace improved\n- Heart rate stayed steady",
          },
        ]}
      />,
    );

    const emphasis = screen.getByText("Faster");
    expect(emphasis.tagName).toBe("STRONG");
    expect(screen.queryByText(/\*\*Faster\*\*/)).toBeNull();

    const list = screen.getByRole("list");
    expect(within(list).getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "Pace improved",
      "Heart rate stayed steady",
    ]);
  });

  it("keeps user messages plain text instead of rendering Markdown", () => {
    const { container } = render(
      <MessageList
        messages={[
          {
            id: "user-1",
            role: "user",
            content: "**Tempo run**\n- keep literal markers",
          },
        ]}
      />,
    );

    expect(container.querySelector("strong")).toBeNull();
    expect(screen.queryByRole("list")).toBeNull();
    expect(container.querySelector("article")?.textContent).toBe(
      "**Tempo run**\n- keep literal markers",
    );
  });

  it("keeps incomplete assistant Markdown readable while streaming", () => {
    const { container } = render(
      <MessageList
        messages={[
          {
            id: "assistant-1",
            role: "assistant",
            content: "You are **getting faster",
          },
        ]}
      />,
    );

    expect(container.querySelector("strong")).toBeNull();
    expect(screen.getByText("You are **getting faster")).toBeTruthy();
  });
});
