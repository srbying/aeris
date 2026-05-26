import type { ReactNode } from "react";

type ChartShellProps = {
  title: string;
  description: string;
  children: ReactNode;
};

export function ChartShell({ title, description, children }: ChartShellProps) {
  return (
    <section className="min-w-0 border border-zinc-200 bg-white p-4">
      <div className="mb-4">
        <h3 className="text-base font-semibold text-zinc-950">{title}</h3>
        <p className="mt-1 text-sm text-zinc-600">{description}</p>
      </div>
      {children}
    </section>
  );
}

export function EmptyPanel({ message = "Not enough data yet." }: { message?: string }) {
  return (
    <div className="flex h-56 items-center justify-center border border-dashed border-zinc-300 bg-zinc-50 px-4 text-center text-sm font-medium text-zinc-500">
      {message}
    </div>
  );
}
