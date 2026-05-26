"use client";

import { useState } from "react";
import type { z } from "zod";
import { uploadResponseSchema } from "../../lib/activity/schema";
import { FileDropzone } from "./file-dropzone";

type UploadSummary = z.infer<typeof uploadResponseSchema>;

type UploadStatus = "idle" | "uploading" | "success" | "error";

type UploadPanelProps = {
  onUploadComplete?: (summary: UploadSummary) => void;
};

export function UploadPanel({ onUploadComplete }: UploadPanelProps = {}) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [status, setStatus] = useState<UploadStatus>("idle");
  const [summary, setSummary] = useState<UploadSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function uploadSelectedFile() {
    if (!selectedFile) {
      setError(error ?? "Choose a Garmin CSV before uploading.");
      setStatus("error");
      return;
    }

    setStatus("uploading");
    setError(null);
    setSummary(null);

    const formData = new FormData();
    formData.set("file", selectedFile);

    try {
      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });
      const contentType = response.headers.get("Content-Type") ?? "";

      if (!response.ok) {
        throw new Error(await readUploadError(response, contentType));
      }

      if (!isJsonResponse(contentType)) {
        throw new Error("Upload response validation failed.");
      }

      const body = await response.json();
      const parsedBody = uploadResponseSchema.safeParse(body);

      if (!parsedBody.success) {
        throw new Error("Upload response validation failed.");
      }

      setSummary(parsedBody.data);
      setStatus("success");
      onUploadComplete?.(parsedBody.data);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Upload failed.");
      setStatus("error");
    }
  }

  return (
    <section
      aria-label="Import Garmin CSV"
      className="flex w-full flex-col gap-4 border border-zinc-200 bg-white p-4"
    >
      <div className="flex flex-col gap-2">
        <h2 className="text-base font-semibold text-zinc-950">Import Garmin CSV</h2>
        <p className="text-sm text-zinc-600">
          Add activity exports and skip runs that already exist.
        </p>
      </div>

      <FileDropzone
        fileName={selectedFile?.name ?? null}
        onFileSelected={(file) => {
          setSelectedFile(file);
          setStatus("idle");
          setError(null);
          setSummary(null);
        }}
        onFileRejected={(message) => {
          setSelectedFile(null);
          setStatus("error");
          setError(message);
          setSummary(null);
        }}
      />

      <div className="flex items-center gap-4">
        <button
          className="h-10 bg-zinc-950 px-4 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
          type="button"
          disabled={status === "uploading"}
          onClick={uploadSelectedFile}
        >
          {status === "uploading" ? "Uploading" : "Upload CSV"}
        </button>

        {status === "uploading" ? (
          <span className="text-sm text-zinc-600">Parsing and importing...</span>
        ) : null}
      </div>

      {status === "success" && summary ? (
        <p className="text-sm font-medium text-emerald-700">
          {summary.inserted} runs added, {summary.skipped} already existed.
        </p>
      ) : null}

      {status === "error" && error ? (
        <p className="text-sm font-medium text-red-700">{error}</p>
      ) : null}
    </section>
  );
}

async function readUploadError(response: Response, contentType: string): Promise<string> {
  if (isJsonResponse(contentType)) {
    try {
      const body: unknown = await response.json();
      return getUploadErrorMessage(body) ?? "Upload failed.";
    } catch {
      return "Upload failed.";
    }
  }

  const text = await response.text();
  return text.trim() || "Upload failed.";
}

function isJsonResponse(contentType: string): boolean {
  return contentType.toLowerCase().includes("json");
}

function getUploadErrorMessage(body: unknown): string | null {
  if (!body || typeof body !== "object") {
    return null;
  }

  const error = getStringProperty(body, "error");

  if (error) {
    return error;
  }

  const message = getStringProperty(body, "message");

  if (message) {
    return message;
  }

  return null;
}

function getStringProperty(value: object, key: string): string | null {
  const candidate = Object.entries(value).find(([entryKey]) => entryKey === key)?.[1];
  return typeof candidate === "string" ? candidate : null;
}
