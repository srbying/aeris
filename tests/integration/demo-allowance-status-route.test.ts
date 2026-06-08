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
      access: "anonymous_demo",
      enabled: false,
      limit: 5,
      remaining: 5,
      exhausted: false,
      availability: "available",
    });
  });

  it("does not expose OpenAI secrets in the public demo status response", async () => {
    vi.stubEnv("OPENAI_API_KEY", "server-openai-key");

    const response = await GET();
    const bodyText = JSON.stringify(await response.json());

    expect(response.status).toBe(200);
    expect(bodyText).not.toContain("OPENAI_API_KEY");
    expect(bodyText).not.toContain("server-openai-key");
  });

  it("returns the configured allowance status when demo limiting is enabled", async () => {
    vi.stubEnv("DEMO_CHAT_ALLOWANCE_ENABLED", "true");
    vi.stubEnv("DEMO_CHAT_TURN_LIMIT", "8");
    const repository = {
      checkAvailability: vi.fn(),
      async consumeTurn() {
        return { exhausted: false, remaining: 7, turnsUsed: 1 };
      },
      async getUsageByVisitorToken() {
        return null;
      },
    };
    setDemoAllowanceDependenciesForTests({ repository });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("Set-Cookie")).toBeNull();
    expect(body).toEqual({
      access: "anonymous_demo",
      enabled: true,
      limit: 8,
      remaining: 8,
      exhausted: false,
      availability: "available",
    });
    expect(repository.checkAvailability).toHaveBeenCalledTimes(1);
  });

  it("reports unavailable when no-cookie demo usage availability cannot be checked", async () => {
    vi.stubEnv("DEMO_CHAT_ALLOWANCE_ENABLED", "true");
    const repository = {
      checkAvailability: vi.fn(async () => {
        throw new Error("storage down");
      }),
      async consumeTurn() {
        return { exhausted: false, remaining: 4, turnsUsed: 1 };
      },
      async getUsageByVisitorToken() {
        return null;
      },
    };
    setDemoAllowanceDependenciesForTests({ repository });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("Set-Cookie")).toBeNull();
    expect(body).toEqual({
      access: "anonymous_demo",
      enabled: true,
      limit: 5,
      remaining: 0,
      exhausted: false,
      availability: "unavailable",
    });
    expect(repository.checkAvailability).toHaveBeenCalledTimes(1);
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
      access: "anonymous_demo",
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
      access: "anonymous_demo",
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
      async checkAvailability() {
        throw new Error("storage down");
      },
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
      access: "anonymous_demo",
      enabled: true,
      limit: 5,
      remaining: 0,
      exhausted: false,
      availability: "unavailable",
    });
  });

  it("reports runner-owner access without reading anonymous demo usage", async () => {
    vi.stubEnv("DEMO_CHAT_ALLOWANCE_ENABLED", "true");
    vi.stubEnv("DEMO_CHAT_TURN_LIMIT", "1");
    vi.stubEnv("RUNNER_OWNER_ACCESS_TOKEN", "owner-token");
    const repository = {
      checkAvailability: vi.fn(),
      async consumeTurn() {
        return { exhausted: true, remaining: 0, turnsUsed: 1 };
      },
      getUsageByVisitorToken: vi.fn(),
    };
    setDemoAllowanceDependenciesForTests({ repository });

    const response = await GET(
      requestWithCookie(
        "aeris_runner_owner_access=c32c7bb97d785c65916c05538cfc0f9d94768cb167eb73615071783ccc4bef77",
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      access: "runner_owner",
      enabled: false,
      limit: 1,
      remaining: 1,
      exhausted: false,
      availability: "available",
    });
    expect(repository.checkAvailability).not.toHaveBeenCalled();
    expect(repository.getUsageByVisitorToken).not.toHaveBeenCalled();
  });
});
