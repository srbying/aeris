// @vitest-environment node

import { describe, expect, it } from "vitest";
import {
  buildReadOnlyDemoAllowanceStatus,
  consumeDemoChatTurn,
  createInMemoryDemoAllowanceRepository,
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

  it("does not create anonymous visitor state when demo limiting is disabled", async () => {
    const repository = createInMemoryDemoAllowanceRepository();
    const decision = await consumeDemoChatTurn({
      env: {},
      generateVisitorToken: () => "visitor-token",
      repository,
      visitorToken: null,
    });

    expect(decision).toMatchObject({
      allowed: true,
      reason: "disabled",
      visitorTokenToSet: null,
      status: {
        enabled: false,
        limit: 5,
        remaining: 5,
        exhausted: false,
        availability: "available",
      },
    });
    await expect(repository.getUsageByVisitorToken("visitor-token")).resolves.toBeNull();
  });

  it("creates anonymous visitor usage and consumes the first valid turn", async () => {
    const repository = createInMemoryDemoAllowanceRepository();
    const decision = await consumeDemoChatTurn({
      env: {
        DEMO_CHAT_ALLOWANCE_ENABLED: "true",
        DEMO_CHAT_TURN_LIMIT: "3",
      },
      generateVisitorToken: () => "visitor-token",
      repository,
      visitorToken: null,
    });

    expect(decision).toMatchObject({
      allowed: true,
      reason: "allowed",
      visitorTokenToSet: "visitor-token",
      status: {
        enabled: true,
        limit: 3,
        remaining: 2,
        exhausted: false,
        availability: "available",
      },
    });
    await expect(repository.getUsageByVisitorToken("visitor-token")).resolves.toMatchObject({
      turnsUsed: 1,
    });
  });

  it("reuses an existing visitor and consumes exactly one turn", async () => {
    const repository = createInMemoryDemoAllowanceRepository();

    await consumeDemoChatTurn({
      env: { DEMO_CHAT_ALLOWANCE_ENABLED: "true" },
      generateVisitorToken: () => "unused-token",
      repository,
      visitorToken: "existing-token",
    });
    const decision = await consumeDemoChatTurn({
      env: { DEMO_CHAT_ALLOWANCE_ENABLED: "true" },
      generateVisitorToken: () => "unused-token",
      repository,
      visitorToken: "existing-token",
    });

    expect(decision).toMatchObject({
      allowed: true,
      reason: "allowed",
      visitorTokenToSet: null,
      status: {
        enabled: true,
        limit: 5,
        remaining: 3,
        exhausted: false,
        availability: "available",
      },
    });
    await expect(repository.getUsageByVisitorToken("existing-token")).resolves.toMatchObject({
      turnsUsed: 2,
    });
  });

  it("rejects exhausted visitors without consuming another turn", async () => {
    const repository = createInMemoryDemoAllowanceRepository();
    const env = {
      DEMO_CHAT_ALLOWANCE_ENABLED: "true",
      DEMO_CHAT_TURN_LIMIT: "1",
    };

    await consumeDemoChatTurn({
      env,
      generateVisitorToken: () => "visitor-token",
      repository,
      visitorToken: "visitor-token",
    });
    const decision = await consumeDemoChatTurn({
      env,
      generateVisitorToken: () => "visitor-token",
      repository,
      visitorToken: "visitor-token",
    });

    expect(decision).toMatchObject({
      allowed: false,
      reason: "exhausted",
      visitorTokenToSet: null,
      status: {
        enabled: true,
        limit: 1,
        remaining: 0,
        exhausted: true,
        availability: "available",
      },
    });
    await expect(repository.getUsageByVisitorToken("visitor-token")).resolves.toMatchObject({
      turnsUsed: 1,
    });
  });

  it("returns unavailable when demo usage storage cannot consume", async () => {
    const repository = {
      async consumeTurn() {
        throw new Error("storage down");
      },
      async getUsageByVisitorToken() {
        return null;
      },
    };

    const decision = await consumeDemoChatTurn({
      env: { DEMO_CHAT_ALLOWANCE_ENABLED: "true" },
      generateVisitorToken: () => "visitor-token",
      repository,
      visitorToken: null,
    });

    expect(decision).toEqual({
      allowed: false,
      reason: "unavailable",
      visitorTokenToSet: null,
      status: {
        enabled: true,
        limit: 5,
        remaining: 0,
        exhausted: false,
        availability: "unavailable",
      },
    });
  });
});
