import type { Activity, ActivityRepository } from "../activity/types";
import { averageEfficiencyForWindow } from "../calculations/efficiency";
import { getActivityContextMonths } from "../config/env";
import {
  formatDistance,
  formatDuration,
  formatElevation,
  formatPace,
  formatPercentChange,
  type UnitSystem,
} from "../measurements/formatters";

export type CompactPromptActivity = {
  d: string;
  pace: number | null;
  paceText: string | null;
  hr: number | null;
  dist: number;
  distText: string;
  dur: number;
  durText: string;
  asc: number | null;
  ascText: string | null;
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
  distText: string;
  dur: number;
  durText: string;
  pace: number | null;
  paceText: string | null;
  hr: number | null;
  hrText: string | null;
  asc: number | null;
  ascText: string | null;
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
  deltaText: {
    dist: string;
    dur: string;
    pace: string | null;
    hr: string | null;
    asc: string | null;
  };
  explanationHint: string;
};

export type EfficiencyDisplay = {
  currentVsPrevious90d: string | null;
  currentVsPrevious180d: string | null;
};

export type ChatContext = {
  contextWindowMonths: number;
  activityCount: number;
  displayUnitSystem: UnitSystem;
  activities: CompactPromptActivity[];
  activitiesJson: string;
  dateComparisonFacts: DateComparisonFacts | null;
  dateComparisonFactsJson: string;
  efficiency: EfficiencySnapshots;
  efficiencyDisplay: EfficiencyDisplay;
};

type BuildChatContextOptions = {
  repository: ActivityRepository;
  now?: Date;
  question?: string;
  unitSystem?: UnitSystem;
};

export async function buildChatContext({
  repository,
  now = new Date(),
  question,
  unitSystem,
}: BuildChatContextOptions): Promise<ChatContext> {
  const months = getActivityContextMonths();
  const displayUnitSystem = unitSystem ?? "imperial";
  const activities = await repository.getRecentActivities({ months, now });
  const runningActivities = filterPromptActivities(activities, { months, now });
  const serializedActivities = serializeActivitiesForPrompt(runningActivities, {
    months,
    now,
    unitSystem: displayUnitSystem,
  });
  const dateComparisonFacts = buildDateComparisonFacts(
    runningActivities,
    question,
    displayUnitSystem,
  );
  const efficiency = buildEfficiencySnapshots(runningActivities, now);

  return {
    contextWindowMonths: months,
    activityCount: serializedActivities.length,
    displayUnitSystem,
    activities: serializedActivities,
    activitiesJson: JSON.stringify(serializedActivities),
    dateComparisonFacts,
    dateComparisonFactsJson: JSON.stringify(dateComparisonFacts),
    efficiency,
    efficiencyDisplay: buildEfficiencyDisplay(efficiency),
  };
}

export function serializeActivitiesForPrompt(
  activities: Activity[],
  options: { months: number; now: Date; unitSystem?: UnitSystem },
): CompactPromptActivity[] {
  const unitSystem = options.unitSystem ?? "imperial";

  return filterPromptActivities(activities, options)
    .sort(
      (left, right) =>
        new Date(left.activityDate).getTime() - new Date(right.activityDate).getTime(),
    )
    .map((activity) => toCompactPromptActivity(activity, unitSystem));
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

function toCompactPromptActivity(
  activity: Activity,
  unitSystem: UnitSystem,
): CompactPromptActivity {
  const title = optionalText(activity.rawCsvRow.Title);
  const moving = parseClockSeconds(activity.rawCsvRow["Moving Time"]);
  const elapsed = parseClockSeconds(activity.rawCsvRow["Elapsed Time"]);

  return {
    d: activity.activityDate.slice(0, 10),
    pace: activity.avgPaceSecPerKm,
    paceText: formatPace(activity.avgPaceSecPerKm, unitSystem),
    hr: activity.avgHr,
    dist: activity.distanceKm,
    distText: formatDistance(activity.distanceKm, unitSystem),
    dur: activity.durationSeconds,
    durText: formatDuration(activity.durationSeconds),
    asc: activity.ascentM,
    ascText: formatElevation(activity.ascentM, unitSystem),
    vo2: activity.vo2maxEstimate,
    ...(title === undefined ? {} : { title }),
    ...(moving === undefined ? {} : { moving }),
    ...(elapsed === undefined ? {} : { elapsed }),
  };
}

function buildDateComparisonFacts(
  activities: Activity[],
  question: string | undefined,
  unitSystem: UnitSystem,
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

  const focusFact = toDateComparisonActivityFact(focus, unitSystem);
  const baselineFact = toDateComparisonActivityFact(baseline, unitSystem);
  const delta = {
    dist: round2(focusFact.dist - baselineFact.dist),
    dur: focusFact.dur - baselineFact.dur,
    pace: nullableDelta(focusFact.pace, baselineFact.pace),
    hr: nullableDelta(focusFact.hr, baselineFact.hr),
    asc: nullableDelta(focusFact.asc, baselineFact.asc),
  };

  return {
    focus: focusFact,
    baseline: baselineFact,
    delta,
    deltaText: buildDeltaText(delta, unitSystem),
    explanationHint: buildExplanationHint(focusFact, baselineFact),
  };
}

function toDateComparisonActivityFact(
  activity: Activity,
  unitSystem: UnitSystem,
): DateComparisonActivityFact {
  return {
    d: activity.activityDate.slice(0, 10),
    dist: activity.distanceKm,
    distText: formatDistance(activity.distanceKm, unitSystem),
    dur: activity.durationSeconds,
    durText: formatDuration(activity.durationSeconds),
    pace: activity.avgPaceSecPerKm,
    paceText: formatPace(activity.avgPaceSecPerKm, unitSystem),
    hr: activity.avgHr,
    hrText: activity.avgHr === null ? null : `${activity.avgHr} bpm`,
    asc: activity.ascentM,
    ascText: formatElevation(activity.ascentM, unitSystem),
  };
}

function buildDeltaText(
  delta: DateComparisonFacts["delta"],
  unitSystem: UnitSystem,
): DateComparisonFacts["deltaText"] {
  return {
    dist: formatSignedDistanceDelta(delta.dist, unitSystem),
    dur: formatSignedDurationDelta(delta.dur),
    pace:
      delta.pace === null ? null : formatSignedPaceDelta(delta.pace, unitSystem),
    hr: delta.hr === null ? null : formatSignedWholeNumberDelta(delta.hr, "bpm"),
    asc:
      delta.asc === null ? null : formatSignedElevationDelta(delta.asc, unitSystem),
  };
}

function buildEfficiencyDisplay(efficiency: EfficiencySnapshots): EfficiencyDisplay {
  return {
    currentVsPrevious90d: formatEfficiencyDelta(
      efficiency.current30d,
      efficiency.previous90d,
    ),
    currentVsPrevious180d: formatEfficiencyDelta(
      efficiency.current30d,
      efficiency.previous180d,
    ),
  };
}

function formatEfficiencyDelta(current: number | null, previous: number | null): string | null {
  const percentChange = formatPercentChange(current, previous);

  return percentChange === null ? null : `${percentChange} speed per heartbeat`;
}

function formatSignedDistanceDelta(deltaKm: number, unitSystem: UnitSystem): string {
  const value = unitSystem === "imperial" ? deltaKm * 0.621371 : deltaKm;
  const unit = unitSystem === "imperial" ? "mi" : "km";

  return `${formatSign(value)}${Math.abs(value).toFixed(1)} ${unit}`;
}

function formatSignedElevationDelta(deltaMeters: number, unitSystem: UnitSystem): string {
  const value = unitSystem === "imperial" ? deltaMeters * 3.28084 : deltaMeters;
  const unit = unitSystem === "imperial" ? "ft" : "m";

  return `${formatSign(value)}${Math.round(Math.abs(value))} ${unit}`;
}

function formatSignedPaceDelta(deltaSecondsPerKm: number, unitSystem: UnitSystem): string {
  const displaySeconds =
    unitSystem === "imperial" ? deltaSecondsPerKm * 1.609344 : deltaSecondsPerKm;
  const unit = unitSystem === "imperial" ? "/mi" : "/km";

  return `${formatSign(displaySeconds)}${formatUnsignedMinutesSeconds(
    displaySeconds,
  )} ${unit}`;
}

function formatSignedDurationDelta(deltaSeconds: number): string {
  return `${formatSign(deltaSeconds)}${formatUnsignedMinutesSeconds(deltaSeconds)}`;
}

function formatSignedWholeNumberDelta(value: number, unit: string): string {
  return `${formatSign(value)}${Math.round(Math.abs(value))} ${unit}`;
}

function formatSign(value: number): string {
  return value > 0 ? "+" : value < 0 ? "-" : "";
}

function formatUnsignedMinutesSeconds(totalSeconds: number): string {
  const rounded = Math.round(Math.abs(totalSeconds));
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const seconds = rounded % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds
      .toString()
      .padStart(2, "0")}`;
  }

  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
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
