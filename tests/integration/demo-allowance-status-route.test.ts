// @vitest-environment node

import { afterEach, describe, expect, it, vi } from "vitest";
import { GET, dynamic } from "../../src/app/api/demo-allowance/status/route";

afterEach(() => {
  vi.unstubAllEnvs();
});

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
});
