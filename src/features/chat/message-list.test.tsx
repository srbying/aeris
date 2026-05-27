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
    expect(screen.getByRole("article", { name: "You turn" }).textContent).toContain(
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

  it("renders assistant emphasis and inline code as light Markdown", () => {
    const { container } = render(
      <MessageList
        messages={[
          {
            id: "assistant-1",
            role: "assistant",
            content: "This is *directionally yes* with `paceText` evidence.",
          },
        ]}
      />,
    );

    const emphasis = screen.getByText("directionally yes");
    expect(emphasis.tagName).toBe("EM");

    const code = screen.getByText("paceText");
    expect(code.tagName).toBe("CODE");
    expect(container.textContent).not.toContain("*directionally yes*");
    expect(container.textContent).not.toContain("`paceText`");
  });

  it("leaves unmatched assistant emphasis and code markers literal", () => {
    const { container } = render(
      <MessageList
        messages={[
          {
            id: "assistant-1",
            role: "assistant",
            content: "Use *partial emphasis and `partial code while streaming",
          },
        ]}
      />,
    );

    expect(container.querySelector("em")).toBeNull();
    expect(container.querySelector("code")).toBeNull();
    expect(screen.getByText("Use *partial emphasis and `partial code while streaming")).toBeTruthy();
  });
});
