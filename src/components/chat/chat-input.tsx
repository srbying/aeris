"use client";

import type { FormEvent } from "react";

type ChatInputProps = {
  disabled: boolean;
  value: string;
  onChange(value: string): void;
  onSubmit(): void;
};

export function ChatInput({ disabled, value, onChange, onSubmit }: ChatInputProps) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit();
  }

  return (
    <form className="mt-4 flex gap-3" onSubmit={handleSubmit}>
      <textarea
        aria-label="Message"
        className="min-h-12 flex-1 resize-none border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 outline-none focus:border-zinc-950"
        disabled={disabled}
        placeholder="Ask about your running data"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      <button
        className="h-12 bg-zinc-950 px-4 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
        disabled={disabled || value.trim() === ""}
        type="submit"
      >
        Send
      </button>
    </form>
  );
}
