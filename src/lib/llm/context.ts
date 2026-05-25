import type { Activity, ActivityRepository } from "../activity/types";
import { averageEfficiencyForWindow } from "../calculations/efficiency";
import { getActivityContextMonths } from "../config/env";

export type CompactPromptActivity = {
  d: string;
  pace: number | null;
  hr: number | null;
  dist: number;
  vo2: number | null;
};

export type EfficiencySnapshots = {
  current30d: number | null;
  previous90d: number | null;
  previous180d: number | null;
};

export type ChatContext = {
  contextWindowMonths: number;
  activityCount: number;
  activities: CompactPromptActivity[];
  activitiesJson: string;
  efficiency: EfficiencySnapshots;
};

type BuildChatContextOptions = {
  repository: ActivityRepository;
  now?: Date;
};

export async function buildChatContext({
  repository,
  now = new Date(),
}: BuildChatContextOptions): Promise<ChatContext> {
  const months = getActivityContextMonths();
  const activities = await repository.getRecentActivities({ months, now });
  const runningActivities = filterPromptActivities(activities, { months, now });
  const serializedActivities = serializeActivitiesForPrompt(runningActivities, { months, now });

  return {
    contextWindowMonths: months,
    activityCount: serializedActivities.length,
    activities: serializedActivities,
    activitiesJson: JSON.stringify(serializedActivities),
    efficiency: buildEfficiencySnapshots(runningActivities, now),
  };
}

export function serializeActivitiesForPrompt(
  activities: Activity[],
  options: { months: number; now: Date },
): CompactPromptActivity[] {
  return filterPromptActivities(activities, options)
    .sort(
      (left, right) =>
        new Date(left.activityDate).getTime() - new Date(right.activityDate).getTime(),
    )
    .map((activity) => ({
      d: activity.activityDate.slice(0, 10),
      pace: activity.avgPaceSecPerKm,
      hr: activity.avgHr,
      dist: activity.distanceKm,
      vo2: activity.vo2maxEstimate,
    }));
}

function filterPromptActivities(
  activities: Activity[],
  options: { months: number; now: Date },
): Activity[] {
  const since = monthsBefore(options.now, options.months);

  return activities.filter((activity) => {
    const activityDate = new Date(activity.activityDate);
    return (
      activity.activityType === "Running" &&
      activityDate >= since &&
      activityDate <= options.now
    );
  });
}

function buildEfficiencySnapshots(activities: Activity[], now: Date): EfficiencySnapshots {
  return {
    current30d: efficiencyWindowEnding(activities, now),
    previous90d: efficiencyWindowEnding(activities, daysBefore(now, 90)),
    previous180d: efficiencyWindowEnding(activities, daysBefore(now, 180)),
  };
}

function efficiencyWindowEnding(activities: Activity[], end: Date): number | null {
  return averageEfficiencyForWindow(activities, daysBefore(end, 30), end);
}

function monthsBefore(now: Date, months: number): Date {
  const date = new Date(now);
  date.setUTCMonth(date.getUTCMonth() - months);
  return date;
}

function daysBefore(now: Date, days: number): Date {
  const date = new Date(now);
  date.setUTCDate(date.getUTCDate() - days);
  return date;
}
