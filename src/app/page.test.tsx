import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import Home from "./page";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Home", () => {
  it("uses the Aeris logo once as a compact header mark next to the product name", () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify([]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    render(<Home />);

    const header = screen.getByRole("banner", { name: "Aeris running analytics" });
    const logo = screen.getByRole("img", { name: "Aeris header mark" });
    const productName = screen.getByRole("heading", { level: 1, name: "Aeris" });
    const repeatedLogoUses = document.querySelectorAll('img[src*="aeris-logo"]');

    expect(header?.contains(logo)).toBe(true);
    expect(header?.contains(productName)).toBe(true);
    expect(repeatedLogoUses).toHaveLength(1);
    expect(logo.getAttribute("width")).toBe("70");
    expect(logo.getAttribute("height")).toBe("48");
    expect(
      logo.compareDocumentPosition(productName) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });
});
