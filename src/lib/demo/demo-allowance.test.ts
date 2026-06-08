// @vitest-environment node

import { describe, expect, it } from "vitest";
import {
  buildReadOnlyDemoAllowanceStatus,
  demoAllowanceStatusSchema,
} from "./demo-allowance";

describe("read-only demo allowance status", () => {
  it("defaults to disabled with the standard five-turn allowance", () => {
    const status = buildReadOnlyDemoAllowanceStatus({});

    expect(status).toEqual({
      enabled: false,
      limit: 5,
      remaining: 5,
      exhausted: false,
      availability: "available",
    });
  });

  it("enables demo limiting only when explicitly opted in", () => {
    const status = buildReadOnlyDemoAllowanceStatus({
      DEMO_CHAT_ALLOWANCE_ENABLED: "true",
    });

    expect(status).toEqual({
      enabled: true,
      limit: 5,
      remaining: 5,
      exhausted: false,
      availability: "available",
    });
  });

  it("uses the configured demo chat turn limit when present", () => {
    const status = buildReadOnlyDemoAllowanceStatus({
      DEMO_CHAT_ALLOWANCE_ENABLED: "true",
      DEMO_CHAT_TURN_LIMIT: "7",
    });

    expect(status.limit).toBe(7);
    expect(status.remaining).toBe(7);
  });

  it("exports a schema for the public status response", () => {
    const parsed = demoAllowanceStatusSchema.parse({
      enabled: true,
      limit: 5,
      remaining: 5,
      exhausted: false,
      availability: "available",
    });

    expect(parsed.availability).toBe("available");
  });
});
