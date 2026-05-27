"use client";

import { ChatPanel } from "../../features/chat/chat-panel";
import { SupportingEvidence } from "../../features/evidence/supporting-evidence";

export function AerisApp() {
  return (
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.08fr)_minmax(480px,0.92fr)]">
      <section aria-label="Aeris conversation" className="min-w-0">
        <ChatPanel />
      </section>

      <SupportingEvidence />
    </div>
  );
}
