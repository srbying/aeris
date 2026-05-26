import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UploadPanel } from "./upload-panel";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function getFileInput(container: HTMLElement): HTMLInputElement {
  const fileInput = container.querySelector<HTMLInputElement>('input[type="file"]');

  if (!fileInput) {
    throw new Error("file input not found");
  }

  return fileInput;
}

describe("UploadPanel", () => {
  it("shows the selected Garmin CSV before upload", () => {
    const { container } = render(<UploadPanel />);
    const fileInput = getFileInput(container);

    fireEvent.change(fileInput, {
      target: {
        files: [new File(["Activity Type,Date\nRunning,2026-05-17"], "garmin.csv")],
      },
    });

    expect(screen.getByText("garmin.csv")).toBeTruthy();
  });

  it("uploads the selected CSV, shows counts, and notifies the parent", async () => {
    const onUploadComplete = vi.fn();
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

    const { container } = render(<UploadPanel onUploadComplete={onUploadComplete} />);
    const fileInput = getFileInput(container);

    fireEvent.change(fileInput, {
      target: {
        files: [new File(["Activity Type,Date\nRunning,2026-05-17"], "garmin.csv")],
      },
    });
    fireEvent.click(screen.getByRole("button", { name: /upload/i }));

    await waitFor(() => {
      expect(container.textContent).toContain("2 runs added");
      expect(container.textContent).toContain("1 already existed");
    });
    expect(onUploadComplete).toHaveBeenCalledOnce();
    expect(onUploadComplete).toHaveBeenCalledWith({
      inserted: 2,
      skipped: 1,
      errors: [],
    });
  });

  it("shows a clear error when upload fails", async () => {
    const onUploadComplete = vi.fn();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "Upload a Garmin activity export CSV." }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const { container } = render(<UploadPanel onUploadComplete={onUploadComplete} />);
    const fileInput = getFileInput(container);

    fireEvent.change(fileInput, {
      target: {
        files: [new File(["Name,Value\nSteven,42"], "bad.csv")],
      },
    });
    fireEvent.click(screen.getByRole("button", { name: /upload/i }));

    await waitFor(() => {
      expect(container.textContent).toContain("Upload a Garmin activity export CSV.");
    });
    expect(onUploadComplete).not.toHaveBeenCalled();
  });

  it("shows non-JSON upload error text when upload fails", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("Gateway temporarily unavailable", {
        status: 502,
        headers: { "Content-Type": "text/plain" },
      }),
    );

    const { container } = render(<UploadPanel />);
    const fileInput = getFileInput(container);

    fireEvent.change(fileInput, {
      target: {
        files: [new File(["Activity Type,Date\nRunning,2026-05-17"], "garmin.csv")],
      },
    });
    fireEvent.click(screen.getByRole("button", { name: /upload/i }));

    await waitFor(() => {
      expect(container.textContent).toContain("Gateway temporarily unavailable");
    });
  });

  it("shows an error when the upload response body is malformed", async () => {
    const onUploadComplete = vi.fn();
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

    const { container } = render(<UploadPanel onUploadComplete={onUploadComplete} />);
    const fileInput = getFileInput(container);

    fireEvent.change(fileInput, {
      target: {
        files: [new File(["Activity Type,Date\nRunning,2026-05-17"], "garmin.csv")],
      },
    });
    fireEvent.click(screen.getByRole("button", { name: /upload/i }));

    await waitFor(() => {
      expect(container.textContent).toContain("Upload response validation failed.");
    });
    expect(onUploadComplete).not.toHaveBeenCalled();
  });

  it("rejects non-CSV files before upload", async () => {
    const onUploadComplete = vi.fn();
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { container } = render(<UploadPanel onUploadComplete={onUploadComplete} />);
    const fileInput = getFileInput(container);

    fireEvent.change(fileInput, {
      target: {
        files: [new File(["not csv"], "garmin.txt", { type: "text/plain" })],
      },
    });
    fireEvent.click(screen.getByRole("button", { name: /upload/i }));

    await waitFor(() => {
      expect(container.textContent).toContain("Choose a CSV file exported from Garmin.");
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(onUploadComplete).not.toHaveBeenCalled();
  });

  it("rejects files over 10MB before upload", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { container } = render(<UploadPanel />);
    const fileInput = getFileInput(container);

    fireEvent.change(fileInput, {
      target: {
        files: [
          new File([new Uint8Array(10 * 1024 * 1024 + 1)], "garmin.csv", {
            type: "text/csv",
          }),
        ],
      },
    });
    fireEvent.click(screen.getByRole("button", { name: /upload/i }));

    await waitFor(() => {
      expect(container.textContent).toContain("CSV files must be 10MB or smaller.");
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
