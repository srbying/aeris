import type { ReactNode } from "react";

type ChartShellProps = {
  title: string;
  description: string;
  children: ReactNode;
};

export function ChartShell({ title, description, children }: ChartShellProps) {
  return (
    <section
      className="flex min-h-[220px] min-w-0 flex-col rounded-lg border border-zinc-200 bg-white p-4 shadow-sm shadow-zinc-200/60"
      data-testid="chart-card"
    >
      <div className="mb-4 flex flex-col gap-2">
        <h3 className="text-sm font-medium leading-5 text-zinc-950">{title}</h3>
        <p className="text-[13px] leading-5 text-zinc-600">{description}</p>
      </div>
      {children}
    </section>
  );
}

export function EmptyPanel({ message = "Not enough data yet." }: { message?: string }) {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center rounded-md border border-dashed border-zinc-300 bg-zinc-50 px-4 text-center text-sm font-medium text-zinc-500">
      {message}
    </div>
  );
}
