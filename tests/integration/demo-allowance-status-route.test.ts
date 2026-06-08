// @vitest-environment node

import { afterEach, describe, expect, it, vi } from "vitest";
import { GET, dynamic } from "../../src/app/api/demo-allowance/status/route";
import {
  consumeDemoChatTurn,
  createInMemoryDemoAllowanceRepository,
} from "../../src/lib/demo/demo-allowance";
import {
  resetDemoAllowanceDependenciesForTests,
  setDemoAllowanceDependenciesForTests,
} from "../../src/lib/demo/dependencies";

afterEach(() => {
  vi.unstubAllEnvs();
  resetDemoAllowanceDependenciesForTests();
});

function requestWithCookie(cookie: string): Request {
  return new Request("http://aeris.test/api/demo-allowance/status", {
    headers: { Cookie: cookie },
  });
}

describe("GET /api/demo-allowance/status", () => {
  it("opts out of static route caching", () => {
    expect(dynamic).toBe("force-dynamic");
  });

  it("returns the local disabled status without setting a cookie", async () => {
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Set-Cookie")).toBeNull();
    expect(body).toEqual({
      enabled: false,
      limit: 5,
      remaining: 5,
      exhausted: false,
      availability: "available",
    });
  });

  it("returns the configured allowance status when demo limiting is enabled", async () => {
    vi.stubEnv("DEMO_CHAT_ALLOWANCE_ENABLED", "true");
    vi.stubEnv("DEMO_CHAT_TURN_LIMIT", "8");

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("Set-Cookie")).toBeNull();
    expect(body).toEqual({
      enabled: true,
      limit: 8,
      remaining: 8,
      exhausted: false,
      availability: "available",
    });
  });

  it("reads existing visitor usage without setting a cookie", async () => {
    vi.stubEnv("DEMO_CHAT_ALLOWANCE_ENABLED", "true");
    vi.stubEnv("DEMO_CHAT_TURN_LIMIT", "5");
    const repository = createInMemoryDemoAllowanceRepository();
    await consumeDemoChatTurn({
      env: {
        DEMO_CHAT_ALLOWANCE_ENABLED: "true",
        DEMO_CHAT_TURN_LIMIT: "5",
      },
      generateVisitorToken: () => "visitor-token",
      repository,
      visitorToken: "visitor-token",
    });
    setDemoAllowanceDependenciesForTests({ repository });

    const response = await GET(requestWithCookie("aeris_demo_visitor=visitor-token"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("Set-Cookie")).toBeNull();
    expect(body).toEqual({
      enabled: true,
      limit: 5,
      remaining: 4,
      exhausted: false,
      availability: "available",
    });
  });

  it("reports exhausted state for an exhausted visitor without setting a cookie", async () => {
    vi.stubEnv("DEMO_CHAT_ALLOWANCE_ENABLED", "true");
    vi.stubEnv("DEMO_CHAT_TURN_LIMIT", "1");
    const repository = createInMemoryDemoAllowanceRepository();
    await consumeDemoChatTurn({
      env: {
        DEMO_CHAT_ALLOWANCE_ENABLED: "true",
        DEMO_CHAT_TURN_LIMIT: "1",
      },
      generateVisitorToken: () => "visitor-token",
      repository,
      visitorToken: "visitor-token",
    });
    setDemoAllowanceDependenciesForTests({ repository });

    const response = await GET(requestWithCookie("aeris_demo_visitor=visitor-token"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("Set-Cookie")).toBeNull();
    expect(body).toEqual({
      enabled: true,
      limit: 1,
      remaining: 0,
      exhausted: true,
      availability: "available",
    });
  });

  it("reports unavailable when existing visitor usage cannot be read", async () => {
    vi.stubEnv("DEMO_CHAT_ALLOWANCE_ENABLED", "true");
    const repository = {
      async consumeTurn() {
        throw new Error("storage down");
      },
      async getUsageByVisitorToken() {
        throw new Error("storage down");
      },
    };
    setDemoAllowanceDependenciesForTests({ repository });

    const response = await GET(requestWithCookie("aeris_demo_visitor=visitor-token"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("Set-Cookie")).toBeNull();
    expect(body).toEqual({
      enabled: true,
      limit: 5,
      remaining: 0,
      exhausted: false,
      availability: "unavailable",
    });
  });
});
