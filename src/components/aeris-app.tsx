"use client";

import { useState } from "react";
import { ChatPanel } from "./chat/chat-panel";
import { Dashboard } from "./dashboard/dashboard";
import { UploadPanel } from "./upload/upload-panel";

export function AerisApp() {
  const [dashboardRefreshKey, setDashboardRefreshKey] = useState(0);

  return (
    <>
      <Dashboard refreshKey={dashboardRefreshKey} />
      <UploadPanel
        onUploadComplete={() => {
          setDashboardRefreshKey((currentKey) => currentKey + 1);
        }}
      />
      <ChatPanel />
    </>
  );
}
