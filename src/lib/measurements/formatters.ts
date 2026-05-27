import type { LLMMessage } from "../llm/types";

export type UnitSystem = "imperial" | "metric";

const KM_TO_MILES = 0.621371;
const METERS_TO_FEET = 3.28084;
const SECONDS_PER_KM_TO_SECONDS_PER_MILE = 1.609344;

export function formatPace(secondsPerKm: number | null, unitSystem: UnitSystem): string | null {
  if (secondsPerKm === null) {
    return null;
  }

  const displaySeconds =
    unitSystem === "imperial"
      ? secondsPerKm * SECONDS_PER_KM_TO_SECONDS_PER_MILE
      : secondsPerKm;
  const unit = unitSystem === "imperial" ? "/mi" : "/km";

  return `${formatMinutesSeconds(displaySeconds)} ${unit}`;
}

export function formatDistance(kilometers: number, unitSystem: UnitSystem): string {
  if (unitSystem === "imperial") {
    return `${(kilometers * KM_TO_MILES).toFixed(1)} mi`;
  }

  return `${kilometers.toFixed(1)} km`;
}

export function formatElevation(meters: number | null, unitSystem: UnitSystem): string | null {
  if (meters === null) {
    return null;
  }

  if (unitSystem === "imperial") {
    return `${Math.round(meters * METERS_TO_FEET)} ft`;
  }

  return `${Math.round(meters)} m`;
}

export function formatDuration(totalSeconds: number): string {
  const rounded = Math.round(totalSeconds);
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

export function formatPercentChange(current: number | null, previous: number | null): string | null {
  if (current === null || previous === null || previous === 0) {
    return null;
  }

  const percent = ((current - previous) / previous) * 100;
  const sign = percent > 0 ? "+" : "";

  return `${sign}${percent.toFixed(1)}%`;
}

export function resolveDisplayUnitSystem({
  currentMessage,
  history = [],
}: {
  currentMessage: string;
  history?: Pick<LLMMessage, "role" | "content">[];
}): UnitSystem {
  const userMessages = [
    ...history
      .filter((message) => message.role === "user")
      .map((message) => message.content),
    currentMessage,
  ];

  let latest: UnitSystem | null = null;

  for (const message of userMessages) {
    const detected = detectLatestUnitMention(message);

    if (detected) {
      latest = detected;
    }
  }

  return latest ?? "imperial";
}

function detectLatestUnitMention(message: string): UnitSystem | null {
  const normalized = message.toLowerCase();
  const matches: Array<{ index: number; unitSystem: UnitSystem }> = [];

  for (const match of normalized.matchAll(/\b(metric|kilometers?|kilometres?|km|meters?|metres?)\b|min\/km|\/km/g)) {
    matches.push({ index: match.index, unitSystem: "metric" });
  }

  for (const match of normalized.matchAll(/\b(imperial|miles?|feet|foot|ft|mi)\b|min\/mi|\/mi/g)) {
    matches.push({ index: match.index, unitSystem: "imperial" });
  }

  return (
    matches.sort((left, right) => left.index - right.index).at(-1)?.unitSystem ?? null
  );
}

function formatMinutesSeconds(totalSeconds: number): string {
  const rounded = Math.round(totalSeconds);
  const minutes = Math.floor(rounded / 60);
  const seconds = rounded % 60;

  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
