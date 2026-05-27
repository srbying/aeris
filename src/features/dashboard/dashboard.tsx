"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { activityInputSchema } from "../../lib/activity/schema";
import type { PublicActivity } from "../../lib/activity/types";
import {
  calculateEfficiencyTrend,
  calculatePaceTrend,
  calculateVo2Trend,
  getRecentActivities,
} from "../../lib/calculations/dashboard";
import { calculateWeeklyMileage } from "../../lib/calculations/weekly-mileage";
import { ActivityHistory } from "./activity-history";
import { EfficiencyTrendChart } from "./efficiency-trend-chart";
import { PaceHeartRateChart } from "./pace-heart-rate-chart";
import { Vo2TrendChart } from "./vo2-trend-chart";
import { WeeklyMileageChart } from "./weekly-mileage-chart";

type DashboardStatus = "loading" | "ready" | "error";

type DashboardProps = {
  historyPanelId?: string;
  refreshKey?: number;
  showActivityHistory?: boolean;
};

const publicActivitySchema = activityInputSchema.extend({
  id: z.string().min(1),
  createdAt: z.string().min(1),
  efficiency: z.number().nullable(),
});

const publicActivitiesSchema = z.array(publicActivitySchema);
const DASHBOARD_FETCH_TIMEOUT_MS = 3_000;

export function Dashboard({
  historyPanelId,
  refreshKey = 0,
  showActivityHistory = false,
}: DashboardProps = {}) {
  const [activities, setActivities] = useState<PublicActivity[]>([]);
  const [status, setStatus] = useState<DashboardStatus>("loading");

  const loadActivities = useCallback(async () => {
    setStatus("loading");

    try {
      const parsedActivities = await fetchActivities();
      setActivities(parsedActivities);
      setStatus("ready");
    } catch {
      setActivities([]);
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    let isActive = true;

    async function loadInitialActivities() {
      try {
        const parsedActivities = await fetchActivities();

        if (!isActive) {
          return;
        }

        setActivities(parsedActivities);
        setStatus("ready");
      } catch {
        if (!isActive) {
          return;
        }

        setActivities([]);
        setStatus("error");
      }
    }

    void loadInitialActivities();

    return () => {
      isActive = false;
    };
  }, [refreshKey]);

  const dashboardData = useMemo(() => {
    const now = new Date();

    return {
      paceTrend: calculatePaceTrend(activities, { now }),
      efficiencyTrend: calculateEfficiencyTrend(activities, { now }),
      vo2Trend: calculateVo2Trend(activities),
      weeklyMileage: calculateWeeklyMileage(activities, { now }),
      recentActivities: getRecentActivities(activities),
    };
  }, [activities]);

  if (status === "loading") {
    return (
      <section className="flex flex-col gap-4 rounded-lg border border-zinc-200 bg-white p-4">
        <h2 className="text-base font-semibold leading-6 text-zinc-950">Trend evidence</h2>
        <p className="text-sm font-medium text-zinc-600">Loading dashboard...</p>
      </section>
    );
  }

  if (status === "error") {
    return (
      <section className="flex flex-col gap-4 rounded-lg border border-red-200 bg-red-50 p-4">
        <h2 className="text-base font-semibold leading-6 text-red-950">Trend evidence</h2>
        <p className="text-sm font-medium text-red-700">Unable to load dashboard data.</p>
        <button
          className="h-10 rounded-md border border-red-300 bg-white px-4 text-sm font-medium text-red-800 transition hover:border-red-700"
          type="button"
          onClick={() => void loadActivities()}
        >
          Retry
        </button>
      </section>
    );
  }

  return (
    <section className="flex w-full flex-col gap-4">
      <div className="flex flex-col gap-2">
        <h2 className="text-base font-semibold leading-6 text-zinc-950">Trend evidence</h2>
        {activities.length === 0 ? (
          <p className="text-sm text-zinc-600">Upload Garmin data to see dashboard trends.</p>
        ) : (
          <p className="text-sm text-zinc-600">
            Trends from {activities.length} uploaded activities.
          </p>
        )}
      </div>

      {showActivityHistory ? (
        <ActivityHistory activities={dashboardData.recentActivities} id={historyPanelId} />
      ) : null}

      <div
        className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(min(100%,320px),1fr))] lg:grid-cols-[repeat(auto-fit,minmax(220px,1fr))]"
        data-testid="chart-grid"
      >
        <PaceHeartRateChart data={dashboardData.paceTrend} />
        <EfficiencyTrendChart trend={dashboardData.efficiencyTrend} />
        <Vo2TrendChart trend={dashboardData.vo2Trend} />
        <WeeklyMileageChart
          data={dashboardData.weeklyMileage}
          hasActivities={activities.length > 0}
        />
      </div>
    </section>
  );
}

async function fetchActivities(): Promise<PublicActivity[]> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, DASHBOARD_FETCH_TIMEOUT_MS);

  let response: Response;

  try {
    response = await fetch("/api/activities", { signal: controller.signal });
  } catch (error) {
    if (isAbortError(error)) {
      throw new Error("Dashboard activity request timed out.");
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    throw new Error("Unable to load dashboard data.");
  }

  const body: unknown = await response.json();
  return publicActivitiesSchema.parse(body);
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}
