// @vitest-environment node

import { describe, expect, it } from "vitest";
import {
  buildRunnerOwnerAccessCookie,
  hasRunnerOwnerAccess,
  hashRunnerOwnerAccessToken,
  RUNNER_OWNER_ACCESS_COOKIE_NAME,
} from "./owner-access";

describe("runner-owner access", () => {
  it("hashes the configured access token before storing it in a cookie", async () => {
    const hash = await hashRunnerOwnerAccessToken("owner-token");

    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hash).not.toBe("owner-token");
  });

  it("builds a production HttpOnly cookie for a valid runner-owner token", async () => {
    const cookie = await buildRunnerOwnerAccessCookie({
      env: {
        NODE_ENV: "production",
        RUNNER_OWNER_ACCESS_TOKEN: "owner-token",
      },
      token: "owner-token",
    });

    expect(cookie).toEqual({
      name: RUNNER_OWNER_ACCESS_COOKIE_NAME,
      value: await hashRunnerOwnerAccessToken("owner-token"),
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: true,
      maxAge: 31_536_000,
    });
  });

  it("does not build a cookie when the token or environment secret is invalid", async () => {
    await expect(
      buildRunnerOwnerAccessCookie({
        env: { RUNNER_OWNER_ACCESS_TOKEN: "owner-token" },
        token: "wrong-token",
      }),
    ).resolves.toBeNull();
    await expect(
      buildRunnerOwnerAccessCookie({
        env: {},
        token: "owner-token",
      }),
    ).resolves.toBeNull();
  });

  it("recognizes only a cookie hash derived from the configured owner token", async () => {
    const validCookieValue = await hashRunnerOwnerAccessToken("owner-token");

    await expect(
      hasRunnerOwnerAccess({
        env: { RUNNER_OWNER_ACCESS_TOKEN: "owner-token" },
        cookieValue: validCookieValue,
      }),
    ).resolves.toBe(true);
    await expect(
      hasRunnerOwnerAccess({
        env: { RUNNER_OWNER_ACCESS_TOKEN: "owner-token" },
        cookieValue: await hashRunnerOwnerAccessToken("other-token"),
      }),
    ).resolves.toBe(false);
  });
});
