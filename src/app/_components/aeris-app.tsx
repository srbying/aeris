"use client";

import { useState } from "react";
import { ChatPanel } from "../../features/chat/chat-panel";
import { Dashboard } from "../../features/dashboard/dashboard";
import { UploadPanel } from "../../features/upload/upload-panel";

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
