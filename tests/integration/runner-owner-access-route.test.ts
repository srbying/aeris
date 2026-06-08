// @vitest-environment node

import { afterEach, describe, expect, it, vi } from "vitest";
import { POST, dynamic } from "../../src/app/api/runner-owner/access/route";
import {
  hashRunnerOwnerAccessToken,
  RUNNER_OWNER_ACCESS_COOKIE_NAME,
} from "../../src/lib/runner-owner/owner-access";

afterEach(() => {
  vi.unstubAllEnvs();
});

function accessRequest(body: unknown): Request {
  return new Request("http://aeris.test/api/runner-owner/access", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/runner-owner/access", () => {
  it("opts out of static route caching", () => {
    expect(dynamic).toBe("force-dynamic");
  });

  it("sets the HttpOnly runner-owner cookie for a valid access token", async () => {
    vi.stubEnv("RUNNER_OWNER_ACCESS_TOKEN", "owner-token");

    const response = await POST(accessRequest({ token: "owner-token" }));
    const body = await response.json();
    const setCookie = response.headers.get("Set-Cookie") ?? "";

    expect(response.status).toBe(200);
    expect(body).toEqual({ ok: true });
    expect(setCookie).toContain(RUNNER_OWNER_ACCESS_COOKIE_NAME);
    expect(setCookie).toContain(await hashRunnerOwnerAccessToken("owner-token"));
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).not.toContain("owner-token");
  });

  it("returns a not-found response without a cookie for invalid owner access", async () => {
    vi.stubEnv("RUNNER_OWNER_ACCESS_TOKEN", "owner-token");

    const response = await POST(accessRequest({ token: "wrong-token" }));
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toEqual({ error: "Not found." });
    expect(response.headers.get("Set-Cookie")).toBeNull();
  });
});
