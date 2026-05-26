import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import Home from "./page";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Home", () => {
  it("shows the Aeris header mark next to the product name", () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify([]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    render(<Home />);

    const logo = screen.getByRole("img", { name: "Aeris logo" });
    const productName = screen.getByText("Aeris");
    const header = screen.getByRole("heading", { name: "Running analytics" }).closest("header");

    expect(header?.contains(logo)).toBe(true);
    expect(header?.contains(productName)).toBe(true);
    expect(
      logo.compareDocumentPosition(productName) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });
});
