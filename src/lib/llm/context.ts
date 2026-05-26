import type { Activity, ActivityRepository } from "../activity/types";
import { averageEfficiencyForWindow } from "../calculations/efficiency";
import { getActivityContextMonths } from "../config/env";

export type CompactPromptActivity = {
  d: string;
  pace: number | null;
  hr: number | null;
  dist: number;
  dur: number;
  asc: number | null;
  vo2: number | null;
  title?: string;
  moving?: number;
  elapsed?: number;
};

export type EfficiencySnapshots = {
  current30d: number | null;
  previous90d: number | null;
  previous180d: number | null;
};

export type DateComparisonActivityFact = {
  d: string;
  dist: number;
  dur: number;
  pace: number | null;
  hr: number | null;
  asc: number | null;
};

export type DateComparisonFacts = {
  focus: DateComparisonActivityFact;
  baseline: DateComparisonActivityFact;
  delta: {
    dist: number;
    dur: number;
    pace: number | null;
    hr: number | null;
    asc: number | null;
  };
  explanationHint: string;
};

export type ChatContext = {
  contextWindowMonths: number;
  activityCount: number;
  activities: CompactPromptActivity[];
  activitiesJson: string;
  dateComparisonFacts: DateComparisonFacts | null;
  dateComparisonFactsJson: string;
  efficiency: EfficiencySnapshots;
};

type BuildChatContextOptions = {
  repository: ActivityRepository;
  now?: Date;
  question?: string;
};

export async function buildChatContext({
  repository,
  now = new Date(),
  question,
}: BuildChatContextOptions): Promise<ChatContext> {
  const months = getActivityContextMonths();
  const activities = await repository.getRecentActivities({ months, now });
  const runningActivities = filterPromptActivities(activities, { months, now });
  const serializedActivities = serializeActivitiesForPrompt(runningActivities, { months, now });
  const dateComparisonFacts = buildDateComparisonFacts(runningActivities, question);

  return {
    contextWindowMonths: months,
    activityCount: serializedActivities.length,
    activities: serializedActivities,
    activitiesJson: JSON.stringify(serializedActivities),
    dateComparisonFacts,
    dateComparisonFactsJson: JSON.stringify(dateComparisonFacts),
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
    .map(toCompactPromptActivity);
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

function toCompactPromptActivity(activity: Activity): CompactPromptActivity {
  return omitUndefined({
    d: activity.activityDate.slice(0, 10),
    pace: activity.avgPaceSecPerKm,
    hr: activity.avgHr,
    dist: activity.distanceKm,
    dur: activity.durationSeconds,
    asc: activity.ascentM,
    vo2: activity.vo2maxEstimate,
    title: optionalText(activity.rawCsvRow.Title),
    moving: parseClockSeconds(activity.rawCsvRow["Moving Time"]),
    elapsed: parseClockSeconds(activity.rawCsvRow["Elapsed Time"]),
  });
}

function buildDateComparisonFacts(
  activities: Activity[],
  question: string | undefined,
): DateComparisonFacts | null {
  const [focusDate, baselineDate] = extractQuestionDateKeys(question);

  if (!focusDate || !baselineDate) {
    return null;
  }

  const focus = activities.find((activity) => activity.activityDate.slice(0, 10) === focusDate);
  const baseline = activities.find((activity) => activity.activityDate.slice(0, 10) === baselineDate);

  if (!focus || !baseline) {
    return null;
  }

  const focusFact = toDateComparisonActivityFact(focus);
  const baselineFact = toDateComparisonActivityFact(baseline);

  return {
    focus: focusFact,
    baseline: baselineFact,
    delta: {
      dist: round2(focusFact.dist - baselineFact.dist),
      dur: focusFact.dur - baselineFact.dur,
      pace: nullableDelta(focusFact.pace, baselineFact.pace),
      hr: nullableDelta(focusFact.hr, baselineFact.hr),
      asc: nullableDelta(focusFact.asc, baselineFact.asc),
    },
    explanationHint: buildExplanationHint(focusFact, baselineFact),
  };
}

function toDateComparisonActivityFact(activity: Activity): DateComparisonActivityFact {
  return {
    d: activity.activityDate.slice(0, 10),
    dist: activity.distanceKm,
    dur: activity.durationSeconds,
    pace: activity.avgPaceSecPerKm,
    hr: activity.avgHr,
    asc: activity.ascentM,
  };
}

function extractQuestionDateKeys(question: string | undefined): string[] {
  if (!question) {
    return [];
  }

  return [
    ...Array.from(
      question.matchAll(
        /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2}),?\s+(\d{4})\b/gi,
      ),
      (match) => ({
        index: match.index,
        value: toDateKey(match[3], match[1], match[2]),
      }),
    ),
    ...Array.from(question.matchAll(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/g), (match) => ({
      index: match.index,
      value: toDateKey(match[1], match[2], match[3]),
    })),
    ...Array.from(question.matchAll(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g), (match) => ({
      index: match.index,
      value: toDateKey(match[3], match[1], match[2]),
    })),
  ]
    .sort((left, right) => left.index - right.index)
    .map((match) => match.value)
    .filter((value): value is string => value !== null)
    .slice(0, 2);
}

function toDateKey(yearText: string, monthText: string, dayText: string): string | null {
  const month = parseMonth(monthText);
  const day = Number(dayText);
  const year = Number(yearText);

  if (month === undefined || !Number.isInteger(day) || !Number.isInteger(year)) {
    return null;
  }

  const date = new Date(Date.UTC(year, month, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return date.toISOString().slice(0, 10);
}

function parseMonth(value: string): number | undefined {
  if (/^\d{1,2}$/.test(value)) {
    const month = Number(value) - 1;
    return month >= 0 && month <= 11 ? month : undefined;
  }

  return MONTHS[value.toLowerCase()];
}

function buildExplanationHint(
  focus: DateComparisonActivityFact,
  baseline: DateComparisonActivityFact,
): string {
  if (
    focus.dur > baseline.dur &&
    focus.dist < baseline.dist &&
    focus.pace !== null &&
    baseline.pace !== null &&
    focus.pace > baseline.pace
  ) {
    return `${focus.d} took longer despite less distance because average pace was slower.`;
  }

  return "Use duration, distance, and pace deltas to explain the comparison without inventing external causes.";
}

function nullableDelta(left: number | null, right: number | null): number | null {
  return left === null || right === null ? null : round2(left - right);
}

function optionalText(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function parseClockSeconds(value: string | undefined): number | undefined {
  const normalized = optionalText(value);

  if (!normalized || normalized === "--") {
    return undefined;
  }

  const parts = normalized.split(":").map(Number);

  if (parts.some((part) => Number.isNaN(part))) {
    return undefined;
  }

  if (parts.length === 3) {
    return Math.round(parts[0] * 3600 + parts[1] * 60 + parts[2]);
  }

  if (parts.length === 2) {
    return Math.round(parts[0] * 60 + parts[1]);
  }

  return undefined;
}

function omitUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entryValue]) => entryValue !== undefined),
  ) as T;
}

function round2(value: number): number {
  return Number(value.toFixed(2));
}

function efficiencyWindowEnding(activities: Activity[], end: Date): number | null {
  return averageEfficiencyForWindow(activities, daysBefore(end, 30), end);
}

const MONTHS: Record<string, number> = {
  january: 0,
  february: 1,
  march: 2,
  april: 3,
  may: 4,
  june: 5,
  july: 6,
  august: 7,
  september: 8,
  october: 9,
  november: 10,
  december: 11,
};

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
