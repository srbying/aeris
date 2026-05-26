import Image from "next/image";
import { AerisApp } from "./_components/aeris-app";

export default function Home() {
  return (
    <div className="min-h-screen bg-white text-zinc-950">
      <main className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-6 py-8">
        <header className="flex flex-col gap-2 border-b border-zinc-200 pb-6">
          <div className="flex items-center gap-3">
            <Image
              alt="Aeris logo"
              className="size-10 rounded-md object-cover"
              height={40}
              priority
              src="/aeris-logo.png"
              width={40}
            />
            <p className="text-sm font-medium uppercase tracking-wide text-zinc-500">Aeris</p>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">
            Running analytics
          </h1>
        </header>

        <AerisApp />
      </main>
    </div>
  );
}
