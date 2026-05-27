"use client";

import { ChatPanel } from "../../features/chat/chat-panel";
import { SupportingEvidence } from "../../features/evidence/supporting-evidence";

export function AerisApp() {
  return (
    <div className="flex flex-col gap-6">
      <section
        aria-label="Aeris conversation"
        className="mx-auto flex h-[40vh] min-h-[280px] w-full max-w-[900px] flex-col"
      >
        <ChatPanel />
      </section>

      <SupportingEvidence />
    </div>
  );
}
