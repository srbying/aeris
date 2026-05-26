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
import { EfficiencyTrendChart } from "./efficiency-trend-chart";
import { PaceHeartRateChart } from "./pace-heart-rate-chart";
import { RecentRunsTable } from "./recent-runs-table";
import { Vo2TrendChart } from "./vo2-trend-chart";
import { WeeklyMileageChart } from "./weekly-mileage-chart";

type DashboardStatus = "loading" | "ready" | "error";

type DashboardProps = {
  refreshKey?: number;
};

const publicActivitySchema = activityInputSchema.extend({
  id: z.string().min(1),
  createdAt: z.string().min(1),
  efficiency: z.number().nullable(),
});

const publicActivitiesSchema = z.array(publicActivitySchema);

export function Dashboard({ refreshKey = 0 }: DashboardProps = {}) {
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
      <section className="border border-zinc-200 bg-zinc-50 p-6">
        <h2 className="text-lg font-semibold text-zinc-950">Dashboard</h2>
        <p className="mt-3 text-sm font-medium text-zinc-600">Loading dashboard...</p>
      </section>
    );
  }

  if (status === "error") {
    return (
      <section className="border border-red-200 bg-red-50 p-6">
        <h2 className="text-lg font-semibold text-red-950">Dashboard</h2>
        <p className="mt-3 text-sm font-medium text-red-700">Unable to load dashboard data.</p>
        <button
          className="mt-4 h-10 border border-red-300 bg-white px-4 text-sm font-medium text-red-800 transition hover:border-red-700"
          type="button"
          onClick={() => void loadActivities()}
        >
          Retry
        </button>
      </section>
    );
  }

  return (
    <section className="w-full border border-zinc-200 bg-zinc-50 p-6">
      <div className="mb-5">
        <h2 className="text-lg font-semibold text-zinc-950">Dashboard</h2>
        {activities.length === 0 ? (
          <p className="mt-1 text-sm text-zinc-600">Upload Garmin data to see dashboard trends.</p>
        ) : (
          <p className="mt-1 text-sm text-zinc-600">
            Trends from {activities.length} uploaded activities.
          </p>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <PaceHeartRateChart data={dashboardData.paceTrend} />
        <EfficiencyTrendChart trend={dashboardData.efficiencyTrend} />
        <Vo2TrendChart trend={dashboardData.vo2Trend} />
        <WeeklyMileageChart
          data={dashboardData.weeklyMileage}
          hasActivities={activities.length > 0}
        />
      </div>

      <div className="mt-4">
        <RecentRunsTable activities={dashboardData.recentActivities} />
      </div>
    </section>
  );
}

async function fetchActivities(): Promise<PublicActivity[]> {
  const response = await fetch("/api/activities");

  if (!response.ok) {
    throw new Error("Unable to load dashboard data.");
  }

  const body: unknown = await response.json();
  return publicActivitiesSchema.parse(body);
}
