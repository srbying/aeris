import { UploadPanel } from "../components/upload/upload-panel";

export default function Home() {
  return (
    <div className="min-h-screen bg-white text-zinc-950">
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 py-8">
        <header className="border-b border-zinc-200 pb-6">
          <p className="text-sm font-medium uppercase tracking-wide text-zinc-500">Aeris</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            Running analytics
          </h1>
        </header>

        <UploadPanel />
      </main>
    </div>
  );
}
