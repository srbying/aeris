import type { Activity } from "../activity/types";
import { calculateAerobicEfficiency, isEfficiencyEligible } from "./efficiency";

export type PaceTrendPoint = {
  date: string;
  paceSecPerKm: number;
  avgHr: number;
  distanceKm: number;
};

export type Vo2TrendPoint = {
  date: string;
  vo2maxEstimate: number;
  rollingAverage7: number | null;
};

export type Vo2Trend = {
  hasEnoughData: boolean;
  points: Vo2TrendPoint[];
};

export type EfficiencyTrendPoint = {
  date: string;
  efficiency: number;
  rollingAverage30: number | null;
};

export type EfficiencyTrend = {
  hasEnoughData: boolean;
  points: EfficiencyTrendPoint[];
  referenceEfficiency: number | null;
};

export type TrendWindowOptions = {
  now?: Date;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function calculatePaceTrend(
  activities: Activity[],
  options: TrendWindowOptions = {},
): PaceTrendPoint[] {
  const now = options.now ?? new Date();
  const start = daysBefore(now, 90);

  return activities
    .filter((activity): activity is Activity & { avgHr: number; avgPaceSecPerKm: number } => {
      const activityDate = new Date(activity.activityDate);
      return (
        isEfficiencyEligible(activity) &&
        activity.avgPaceSecPerKm !== null &&
        activityDate >= start &&
        activityDate <= now
      );
    })
    .sort(compareActivityDate)
    .map((activity) => ({
      date: dateKey(activity.activityDate),
      paceSecPerKm: activity.avgPaceSecPerKm,
      avgHr: activity.avgHr,
      distanceKm: activity.distanceKm,
    }));
}

export function calculateVo2Trend(activities: Activity[]): Vo2Trend {
  const validActivities = activities
    .filter((activity): activity is Activity & { vo2maxEstimate: number } => {
      return (
        activity.vo2maxEstimate !== null &&
        activity.vo2maxEstimate >= 30 &&
        activity.vo2maxEstimate <= 80
      );
    })
    .sort(compareActivityDate);

  const points = validActivities.map((activity, index) => ({
    date: dateKey(activity.activityDate),
    vo2maxEstimate: activity.vo2maxEstimate,
    rollingAverage7: rollingAverage(
      validActivities.slice(Math.max(0, index - 6), index + 1).map((row) => row.vo2maxEstimate),
      7,
    ),
  }));

  return {
    hasEnoughData: points.length >= 5,
    points,
  };
}

export function calculateEfficiencyTrend(
  activities: Activity[],
  options: TrendWindowOptions = {},
): EfficiencyTrend {
  const now = options.now ?? new Date();
  const start = monthsBefore(now, 6);
  const eligibleActivities = activities
    .filter((activity) => {
      const activityDate = new Date(activity.activityDate);
      return activityDate >= start && activityDate <= now;
    })
    .map((activity) => ({
      activity,
      efficiency: calculateAerobicEfficiency(activity),
    }))
    .filter((row): row is { activity: Activity; efficiency: number } => row.efficiency !== null)
    .sort((left, right) => compareActivityDate(left.activity, right.activity));

  const points = eligibleActivities.map((row, index) => {
    const pointDate = new Date(row.activity.activityDate);
    const windowStart = daysBefore(pointDate, 30);
    const windowValues = eligibleActivities
      .slice(0, index + 1)
      .filter(({ activity }) => {
        const activityDate = new Date(activity.activityDate);
        return activityDate >= windowStart && activityDate <= pointDate;
      })
      .map(({ efficiency }) => efficiency);

    return {
      date: dateKey(row.activity.activityDate),
      efficiency: round4(row.efficiency),
      rollingAverage30: average(windowValues),
    };
  });

  return {
    hasEnoughData: points.length >= 2,
    points,
    referenceEfficiency: averageEfficiencyNear(daysBefore(now, 90), eligibleActivities),
  };
}

export function getRecentActivities(activities: Activity[], limit = 10): Activity[] {
  return [...activities].sort((left, right) => compareActivityDate(right, left)).slice(0, limit);
}

function rollingAverage(values: number[], minimumCount: number): number | null {
  if (values.length < minimumCount) {
    return null;
  }

  return average(values);
}

function average(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }

  return round4(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function averageEfficiencyNear(
  referenceDate: Date,
  rows: Array<{ activity: Activity; efficiency: number }>,
): number | null {
  const start = daysBefore(referenceDate, 15);
  const end = addDays(referenceDate, 15);
  const values = rows
    .filter(({ activity }) => {
      const activityDate = new Date(activity.activityDate);
      return activityDate >= start && activityDate <= end;
    })
    .map(({ efficiency }) => efficiency);

  return average(values);
}

function compareActivityDate(left: Activity, right: Activity): number {
  return new Date(left.activityDate).getTime() - new Date(right.activityDate).getTime();
}

function monthsBefore(date: Date, months: number): Date {
  const value = new Date(date);
  value.setUTCMonth(value.getUTCMonth() - months);
  return value;
}

function daysBefore(date: Date, days: number): Date {
  return addDays(date, -days);
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * MS_PER_DAY);
}

function dateKey(value: string): string {
  return new Date(value).toISOString().slice(0, 10);
}

function round4(value: number): number {
  return Number(value.toFixed(4));
}
