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
    <form
      aria-label="Ask Aeris a custom question"
      className="flex flex-col gap-4 border-t border-zinc-200/80 bg-white p-4 shadow-[0_-12px_30px_rgba(24,24,27,0.05)] sm:flex-row"
      onSubmit={handleSubmit}
    >
      <textarea
        aria-label="Message"
        className="min-h-14 flex-1 resize-none rounded-md border border-zinc-200 bg-white px-4 py-4 text-sm leading-5 text-zinc-950 outline-none transition-[border-color,box-shadow] duration-200 focus:border-sky-500 focus:ring-2 focus:ring-sky-100 motion-reduce:transition-none"
        disabled={disabled}
        placeholder="Ask about your running data"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      <button
        className="h-14 shrink-0 rounded-md bg-zinc-950 px-4 text-sm font-medium text-white transition-colors duration-200 hover:bg-sky-950 disabled:cursor-not-allowed disabled:bg-zinc-300 motion-reduce:transition-none sm:w-24"
        disabled={disabled || value.trim() === ""}
        type="submit"
      >
        Send
      </button>
    </form>
  );
}
