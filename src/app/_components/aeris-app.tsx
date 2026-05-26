"use client";

import { useState } from "react";
import { ChatPanel } from "../../features/chat/chat-panel";
import { Dashboard } from "../../features/dashboard/dashboard";
import { UploadPanel } from "../../features/upload/upload-panel";

export function AerisApp() {
  const [dashboardRefreshKey, setDashboardRefreshKey] = useState(0);

  return (
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.9fr)]">
      <section aria-label="Aeris conversation" className="min-w-0">
        <ChatPanel />
      </section>

      <aside aria-label="Supporting evidence" className="flex min-w-0 flex-col gap-6">
        <Dashboard refreshKey={dashboardRefreshKey} />
        <UploadPanel
          onUploadComplete={() => {
            setDashboardRefreshKey((currentKey) => currentKey + 1);
          }}
        />
      </aside>
    </div>
  );
}
