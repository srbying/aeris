import { describe, expect, it } from "vitest";
import { formatPace } from "./formatters";

describe("dashboard formatters", () => {
  it("formats pace without producing 60 seconds", () => {
    expect(formatPace(359.6)).toBe("6:00 /km");
  });
});
