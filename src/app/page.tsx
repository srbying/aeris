import Image from "next/image";
import { AerisApp } from "./_components/aeris-app";

export default function Home() {
  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-950">
      <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
        <header
          aria-label="Aeris running analytics"
          className="flex flex-col gap-4 border-b border-zinc-200/80 pb-5 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex min-w-0 items-center gap-4">
            <span className="flex h-14 w-20 shrink-0 items-center justify-center rounded-lg border border-sky-100 bg-white shadow-sm shadow-sky-950/5">
              <Image
                alt="Aeris header mark"
                className="h-12 w-[70px] object-contain"
                height={48}
                priority
                src="/aeris-logo.png"
                width={70}
              />
            </span>
            <div className="flex min-w-0 flex-col gap-2">
              <h1 className="text-3xl font-semibold leading-none text-zinc-950">Aeris</h1>
              <p className="text-sm leading-6 text-zinc-600">Running analytics</p>
            </div>
          </div>
          <p className="max-w-sm text-sm leading-6 text-zinc-500">
            Chat-first trend evidence for pace, heart rate, mileage, and fitness.
          </p>
        </header>

        <AerisApp />
      </main>
    </div>
  );
}
