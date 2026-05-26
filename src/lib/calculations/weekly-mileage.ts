import type { Activity } from "../activity/types";

export type WeeklyMileagePoint = {
  weekStart: string;
  distanceKm: number;
};

export type WeeklyMileageOptions = {
  now?: Date;
  weeks?: number;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DEFAULT_WEEK_COUNT = 16;

export function calculateWeeklyMileage(
  activities: Activity[],
  options: WeeklyMileageOptions = {},
): WeeklyMileagePoint[] {
  const now = options.now ?? new Date();
  const weekCount = normalizeWeekCount(options.weeks);
  const firstWeekStart = addDays(startOfIsoWeek(now), -(weekCount - 1) * 7);
  const totals = new Map<string, number>();

  for (let index = 0; index < weekCount; index += 1) {
    totals.set(dateKey(addDays(firstWeekStart, index * 7)), 0);
  }

  for (const activity of activities) {
    const activityDate = new Date(activity.activityDate);

    if (Number.isNaN(activityDate.getTime()) || activityDate > now || activityDate < firstWeekStart) {
      continue;
    }

    const key = dateKey(startOfIsoWeek(activityDate));

    if (totals.has(key)) {
      totals.set(key, Number(((totals.get(key) ?? 0) + activity.distanceKm).toFixed(3)));
    }
  }

  return Array.from(totals, ([weekStart, distanceKm]) => ({ weekStart, distanceKm }));
}

function normalizeWeekCount(value: number | undefined): number {
  const weekCount = Number(value ?? DEFAULT_WEEK_COUNT);

  if (!Number.isFinite(weekCount) || weekCount <= 0) {
    return DEFAULT_WEEK_COUNT;
  }

  return Math.floor(weekCount);
}

function startOfIsoWeek(date: Date): Date {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = start.getUTCDay() || 7;
  start.setUTCDate(start.getUTCDate() - day + 1);
  return start;
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * MS_PER_DAY);
}

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}
