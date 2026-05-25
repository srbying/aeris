import type { Activity } from "../activity/types";

export function calculateAerobicEfficiency(activity: Activity): number | null {
  if (!isEfficiencyEligible(activity)) {
    return null;
  }

  return (activity.distanceKm * 1000) / activity.durationSeconds / activity.avgHr;
}

export function isEfficiencyEligible(activity: Activity): activity is Activity & { avgHr: number } {
  return (
    activity.activityType === "Running" &&
    activity.distanceKm >= 3 &&
    activity.durationSeconds >= 900 &&
    activity.avgHr !== null &&
    activity.avgHr >= 120 &&
    activity.avgHr <= 185
  );
}

export function averageEfficiencyForWindow(
  activities: Activity[],
  start: Date,
  end: Date,
): number | null {
  const values = activities
    .filter((activity) => {
      const activityDate = new Date(activity.activityDate);
      return activityDate >= start && activityDate <= end;
    })
    .map(calculateAerobicEfficiency)
    .filter((value): value is number => value !== null);

  if (values.length === 0) {
    return null;
  }

  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  return Number(average.toFixed(4));
}
