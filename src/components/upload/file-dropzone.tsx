"use client";

import type { DragEvent } from "react";

type FileDropzoneProps = {
  fileName: string | null;
  onFileSelected: (file: File) => void;
};

export function FileDropzone({ fileName, onFileSelected }: FileDropzoneProps) {
  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    const file = event.dataTransfer.files.item(0);

    if (file) {
      onFileSelected(file);
    }
  }

  return (
    <label
      className="flex min-h-36 cursor-pointer flex-col items-center justify-center gap-3 border border-dashed border-zinc-300 bg-white px-6 py-8 text-center transition hover:border-zinc-500"
      onDragOver={(event) => event.preventDefault()}
      onDrop={handleDrop}
    >
      <span className="text-sm font-medium text-zinc-900">
        {fileName ?? "Select or drop a Garmin CSV"}
      </span>
      <span className="text-xs text-zinc-500">CSV files up to 10MB</span>
      <input
        className="sr-only"
        type="file"
        accept=".csv,text/csv"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) {
            onFileSelected(file);
          }
        }}
      />
    </label>
  );
}
