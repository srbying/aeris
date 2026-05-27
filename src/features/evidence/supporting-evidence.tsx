"use client";

import { useId, useState } from "react";
import { Dashboard } from "../dashboard/dashboard";
import { UploadPanel } from "../upload/upload-panel";

export function SupportingEvidence() {
  const [dashboardRefreshKey, setDashboardRefreshKey] = useState(0);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const importPanelId = useId();
  const historyPanelId = useId();

  return (
    <aside
      aria-label="Supporting evidence"
      className="flex min-w-0 flex-col gap-4"
    >
      <div
        aria-label="Aeris utilities"
        className="flex flex-wrap items-center gap-2 rounded-lg border border-zinc-200 bg-white p-2 shadow-sm shadow-zinc-200/60"
        role="toolbar"
      >
        <button
          aria-controls={historyPanelId}
          aria-expanded={isHistoryOpen}
          className="h-10 rounded-md border border-transparent bg-white px-4 text-sm font-medium text-zinc-800 transition-[border-color,color] hover:border-sky-500 hover:text-zinc-950 focus-visible:border-sky-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-100"
          type="button"
          onClick={() => {
            setIsHistoryOpen((current) => !current);
          }}
        >
          Activity history
        </button>
        <button
          aria-controls={importPanelId}
          aria-expanded={isImportOpen}
          className="h-10 rounded-md border border-transparent bg-white px-4 text-sm font-medium text-zinc-800 transition-[border-color,color] hover:border-sky-500 hover:text-zinc-950 focus-visible:border-sky-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-100"
          type="button"
          onClick={() => {
            setIsImportOpen((current) => !current);
          }}
        >
          Import CSV
        </button>
      </div>

      {isImportOpen ? (
        <div id={importPanelId}>
          <UploadPanel
            onUploadComplete={() => {
              setDashboardRefreshKey((currentKey) => currentKey + 1);
            }}
          />
        </div>
      ) : null}

      <Dashboard
        historyPanelId={historyPanelId}
        refreshKey={dashboardRefreshKey}
        showActivityHistory={isHistoryOpen}
      />
    </aside>
  );
}
