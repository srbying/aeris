import { describe, expect, it } from "vitest";
import {
  formatDistance,
  formatDuration,
  formatElevation,
  formatHeartRate,
  formatPace,
  formatPercentChange,
  resolveDisplayUnitSystem,
} from "./formatters";

describe("measurement formatters", () => {
  it("formats heart rate as bpm while preserving null heart-rate values", () => {
    expect(formatHeartRate(145)).toBe("145 bpm");
    expect(formatHeartRate(null)).toBeNull();
  });

  it("formats internal seconds per kilometer as imperial min:sec per mile by default", () => {
    expect(formatPace(360, "imperial")).toBe("9:39 /mi");
  });

  it("formats internal seconds per kilometer as metric min:sec per kilometer on metric request", () => {
    expect(formatPace(360, "metric")).toBe("6:00 /km");
  });

  it("formats distance as miles by default", () => {
    expect(formatDistance(10, "imperial")).toBe("6.2 mi");
  });

  it("formats elevation as feet by default", () => {
    expect(formatElevation(40, "imperial")).toBe("131 ft");
  });

  it("formats raw seconds as a runner-readable duration", () => {
    expect(formatDuration(4804)).toBe("1:20:04");
  });

  it("formats efficiency deltas as percentage changes", () => {
    expect(formatPercentChange(0.0222, 0.02)).toBe("+11.0%");
  });

  it("uses latest user wording when resolving display units", () => {
    expect(
      resolveDisplayUnitSystem({
        currentMessage: "Actually show that in kilometers and min/km.",
        history: [{ role: "user", content: "Use miles and feet please." }],
      }),
    ).toBe("metric");

    expect(
      resolveDisplayUnitSystem({
        currentMessage: "Actually use miles and feet.",
        history: [{ role: "user", content: "Can you show metric units?" }],
      }),
    ).toBe("imperial");
  });
});
