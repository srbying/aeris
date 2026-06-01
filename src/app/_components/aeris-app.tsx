"use client";

import { ChatPanel } from "../../features/chat/chat-panel";
import { SupportingEvidence } from "../../features/evidence/supporting-evidence";

export function AerisApp() {
  return (
    <div className="flex flex-col gap-6">
      <section
        aria-label="Aeris conversation"
        className="mx-auto flex h-[78vh] min-h-[280px] w-full max-w-6xl flex-col lg:min-h-[620px]"
      >
        <ChatPanel />
      </section>

      <SupportingEvidence />
    </div>
  );
}
