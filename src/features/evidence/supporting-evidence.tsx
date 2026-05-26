"use client";

import { useState } from "react";
import { Dashboard } from "../dashboard/dashboard";
import { UploadPanel } from "../upload/upload-panel";

export function SupportingEvidence() {
  const [dashboardRefreshKey, setDashboardRefreshKey] = useState(0);

  return (
    <aside
      aria-label="Supporting evidence"
      className="flex min-w-0 flex-col gap-5 border border-zinc-200 bg-zinc-50 p-5"
    >
      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold text-zinc-950">Supporting evidence</h2>
        <p className="text-sm leading-6 text-zinc-600">
          Trend charts and Garmin imports that keep the conversation grounded in your run history.
        </p>
      </div>

      <Dashboard refreshKey={dashboardRefreshKey} />
      <UploadPanel
        onUploadComplete={() => {
          setDashboardRefreshKey((currentKey) => currentKey + 1);
        }}
      />
    </aside>
  );
}
