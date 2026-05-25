import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UploadPanel } from "../../src/components/upload/upload-panel";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("UploadPanel", () => {
  it("uploads the selected CSV and shows inserted and skipped counts", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          inserted: 2,
          skipped: 1,
          errors: [],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    const { container } = render(<UploadPanel />);
    const fileInput = container.querySelector('input[type="file"]');

    expect(fileInput).not.toBeNull();
    fireEvent.change(fileInput as HTMLInputElement, {
      target: {
        files: [new File(["Activity Type,Date\nRunning,2026-05-17"], "garmin.csv")],
      },
    });
    fireEvent.click(screen.getByRole("button", { name: /upload/i }));

    await waitFor(() => {
      expect(container.textContent).toContain("2 runs added");
      expect(container.textContent).toContain("1 already existed");
    });
  });

  it("shows a clear error when upload fails", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "Upload a Garmin activity export CSV." }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const { container } = render(<UploadPanel />);
    const fileInput = container.querySelector('input[type="file"]');

    fireEvent.change(fileInput as HTMLInputElement, {
      target: {
        files: [new File(["Name,Value\nSteven,42"], "bad.csv")],
      },
    });
    fireEvent.click(screen.getByRole("button", { name: /upload/i }));

    await waitFor(() => {
      expect(container.textContent).toContain("Upload a Garmin activity export CSV.");
    });
  });

  it("shows an error when the upload response body is malformed", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          inserted: "two",
          skipped: 1,
          errors: [],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    const { container } = render(<UploadPanel />);
    const fileInput = container.querySelector('input[type="file"]');

    fireEvent.change(fileInput as HTMLInputElement, {
      target: {
        files: [new File(["Activity Type,Date\nRunning,2026-05-17"], "garmin.csv")],
      },
    });
    fireEvent.click(screen.getByRole("button", { name: /upload/i }));

    await waitFor(() => {
      expect(container.textContent).toContain("Upload response validation failed.");
    });
  });
});
