"use client";

import { useEffect, useId, useState, type KeyboardEvent } from "react";
import {
  bootstrapDemoAllowanceStatus,
  type DemoAllowanceStatus,
} from "../../lib/demo/client-demo-access";
import { OWNER_UPLOAD_FORBIDDEN_MESSAGE } from "../../lib/activity/upload-messages";
import { Dashboard } from "../dashboard/dashboard";
import { UploadPanel } from "../upload/upload-panel";

type EvidenceTab = "activity-history" | "trend-evidence" | "import-csv";

const evidenceTabs: { id: EvidenceTab; label: string }[] = [
  { id: "activity-history", label: "Activity history" },
  { id: "trend-evidence", label: "Trend evidence" },
  { id: "import-csv", label: "Import CSV" },
];

export function SupportingEvidence() {
  const [dashboardRefreshKey, setDashboardRefreshKey] = useState(0);
  const [activeTab, setActiveTab] = useState<EvidenceTab>("activity-history");
  const [demoAllowanceStatus, setDemoAllowanceStatus] =
    useState<DemoAllowanceStatus | null>(null);
  const [isDemoAllowanceStatusResolved, setIsDemoAllowanceStatusResolved] = useState(false);
  const tabRootId = useId();
  const tabPanelId = `${tabRootId}-panel`;
  const hasOwnerUploadAccess = demoAllowanceStatus?.access === "runner_owner";

  useEffect(() => {
    let isMounted = true;

    async function loadDemoAllowanceStatus() {
      const nextStatus = await bootstrapDemoAllowanceStatus();

      if (isMounted) {
        setDemoAllowanceStatus(nextStatus);
        setIsDemoAllowanceStatusResolved(true);
      }
    }

    void loadDemoAllowanceStatus();

    return () => {
      isMounted = false;
    };
  }, []);

  function focusTab(tab: EvidenceTab) {
    document.getElementById(tabId(tab))?.focus();
  }

  function tabId(tab: EvidenceTab) {
    return `${tabRootId}-${tab}-tab`;
  }

  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, tab: EvidenceTab) {
    const currentIndex = evidenceTabs.findIndex((candidate) => candidate.id === tab);
    const lastIndex = evidenceTabs.length - 1;
    let nextIndex = currentIndex;

    if (event.key === "ArrowRight") {
      nextIndex = currentIndex === lastIndex ? 0 : currentIndex + 1;
    } else if (event.key === "ArrowLeft") {
      nextIndex = currentIndex === 0 ? lastIndex : currentIndex - 1;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = lastIndex;
    } else {
      return;
    }

    event.preventDefault();
    const nextTab = evidenceTabs[nextIndex].id;
    setActiveTab(nextTab);
    focusTab(nextTab);
  }

  const dashboardView = activeTab === "import-csv" ? "hidden" : activeTab;

  return (
    <aside
      aria-label="Supporting evidence"
      className="flex min-w-0 flex-col gap-4"
    >
      <div
        aria-label="Supporting evidence sections"
        className="flex flex-wrap items-center gap-2 rounded-lg border border-zinc-200 bg-white p-2 shadow-sm shadow-zinc-200/60"
        role="tablist"
      >
        {evidenceTabs.map((tab) => {
          const isSelected = activeTab === tab.id;

          return (
            <button
              aria-controls={tabPanelId}
              aria-selected={isSelected}
              className={
                isSelected
                  ? "h-10 rounded-md border border-sky-500 bg-sky-50 px-4 text-sm font-medium text-zinc-950 transition-[border-color,color] focus-visible:border-sky-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-100"
                  : "h-10 rounded-md border border-transparent bg-white px-4 text-sm font-medium text-zinc-800 transition-[border-color,color] hover:border-sky-500 hover:text-zinc-950 focus-visible:border-sky-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-100"
              }
              id={tabId(tab.id)}
              key={tab.id}
              role="tab"
              tabIndex={isSelected ? 0 : -1}
              type="button"
              onClick={() => {
                setActiveTab(tab.id);
              }}
              onKeyDown={(event) => {
                handleTabKeyDown(event, tab.id);
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div
        aria-labelledby={tabId(activeTab)}
        id={tabPanelId}
        role="tabpanel"
      >
        {activeTab === "import-csv" ? (
          !isDemoAllowanceStatusResolved ? null : hasOwnerUploadAccess ? (
            <UploadPanel
              onUploadComplete={() => {
                setDashboardRefreshKey((currentKey) => currentKey + 1);
              }}
            />
          ) : (
            <OwnerOnlyUploadNotice />
          )
        ) : null}

        <Dashboard
          activeView={dashboardView}
          refreshKey={dashboardRefreshKey}
        />
      </div>
    </aside>
  );
}

function OwnerOnlyUploadNotice() {
  return (
    <section
      aria-label="Import Garmin CSV"
      className="flex w-full flex-col gap-3 rounded-lg border border-zinc-200 bg-white p-4 shadow-sm shadow-zinc-200/60"
    >
      <h2 className="text-base font-semibold leading-6 text-zinc-950">Import Garmin CSV</h2>
      <p className="text-sm font-medium leading-6 text-zinc-700">
        {OWNER_UPLOAD_FORBIDDEN_MESSAGE}
      </p>
    </section>
  );
}
