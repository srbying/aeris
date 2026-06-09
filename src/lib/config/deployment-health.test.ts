// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import {
  validateDeploymentEnvironment,
  verifySupabaseConnectivity,
} from "./deployment-health";

describe("deployment health checks", () => {
  it("accepts the required production environment without exposing OpenAI keys", () => {
    const result = validateDeploymentEnvironment({
      NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
      OPENAI_API_KEY: "server-key",
      LLM_PROVIDER: "openai",
      LLM_MODEL: "gpt-5.5",
      RUNNER_OWNER_ACCESS_TOKEN: "owner-token",
      ACTIVITY_CONTEXT_MONTHS: "12",
    });

    expect(result).toEqual({
      ok: true,
      missing: [],
      invalid: [],
    });
  });

  it("accepts valid production demo allowance settings", () => {
    const result = validateDeploymentEnvironment({
      NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
      OPENAI_API_KEY: "server-key",
      LLM_PROVIDER: "openai",
      LLM_MODEL: "gpt-5.5",
      RUNNER_OWNER_ACCESS_TOKEN: "owner-token",
      DEMO_CHAT_ALLOWANCE_ENABLED: "true",
      DEMO_CHAT_TURN_LIMIT: "5",
    });

    expect(result).toEqual({
      ok: true,
      missing: [],
      invalid: [],
    });
  });

  it.each(["0", "-1", "1.5", "abc"])(
    "rejects invalid demo allowance limit %s",
    (limit) => {
      const result = validateDeploymentEnvironment({
        NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
        SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
        OPENAI_API_KEY: "server-key",
        LLM_PROVIDER: "openai",
        LLM_MODEL: "gpt-5.5",
        RUNNER_OWNER_ACCESS_TOKEN: "owner-token",
        DEMO_CHAT_ALLOWANCE_ENABLED: "true",
        DEMO_CHAT_TURN_LIMIT: limit,
      });

      expect(result.ok).toBe(false);
      expect(result.invalid).toContain(
        "DEMO_CHAT_TURN_LIMIT must be a positive integer.",
      );
    },
  );

  it("rejects invalid demo allowance enablement settings", () => {
    const result = validateDeploymentEnvironment({
      NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
      OPENAI_API_KEY: "server-key",
      LLM_PROVIDER: "openai",
      LLM_MODEL: "gpt-5.5",
      RUNNER_OWNER_ACCESS_TOKEN: "owner-token",
      DEMO_CHAT_ALLOWANCE_ENABLED: "yes",
    });

    expect(result.ok).toBe(false);
    expect(result.invalid).toContain(
      "DEMO_CHAT_ALLOWANCE_ENABLED must be true or false when set.",
    );
  });

  it("requires the Supabase service role key when demo limiting is enabled", () => {
    const result = validateDeploymentEnvironment({
      NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
      OPENAI_API_KEY: "server-key",
      LLM_PROVIDER: "openai",
      LLM_MODEL: "gpt-5.5",
      RUNNER_OWNER_ACCESS_TOKEN: "owner-token",
      DEMO_CHAT_ALLOWANCE_ENABLED: "true",
    });

    expect(result.ok).toBe(false);
    expect(result.missing).toContain("SUPABASE_SERVICE_ROLE_KEY");
  });

  it("reports missing deployment variables and blocks client-exposed OpenAI keys", () => {
    const result = validateDeploymentEnvironment({
      NEXT_PUBLIC_SUPABASE_URL: "",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
      NEXT_PUBLIC_OPENAI_API_KEY: "client-leak",
      NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY: "client-service-role-leak",
      OPENAI_API_KEY: "",
      LLM_PROVIDER: "openai",
      LLM_MODEL: "gpt-5.5",
      ACTIVITY_CONTEXT_MONTHS: "0",
      DEMO_CHAT_ALLOWANCE_ENABLED: "true",
      DEMO_CHAT_TURN_LIMIT: "abc",
    });

    expect(result.ok).toBe(false);
    expect(result.missing).toEqual(
      expect.arrayContaining([
        "NEXT_PUBLIC_SUPABASE_URL",
        "OPENAI_API_KEY",
        "RUNNER_OWNER_ACCESS_TOKEN",
        "SUPABASE_SERVICE_ROLE_KEY",
      ]),
    );
    expect(result.invalid).toEqual(
      expect.arrayContaining([
        "NEXT_PUBLIC_OPENAI_API_KEY must not be set; OpenAI keys are server-only.",
        "NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY must not be set; Supabase service role keys are server-only.",
        "ACTIVITY_CONTEXT_MONTHS must be a positive integer.",
        "DEMO_CHAT_TURN_LIMIT must be a positive integer.",
      ]),
    );
  });

  it("verifies Supabase connectivity with the anon key", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const result = await verifySupabaseConnectivity({
      env: {
        NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
      },
      fetch: fetchMock,
    });

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://project.supabase.co/rest/v1/activities?select=id&limit=1",
      expect.objectContaining({
        headers: expect.objectContaining({
          apikey: "anon-key",
          Authorization: "Bearer anon-key",
        }),
      }),
    );
  });

  it("returns a user-safe Supabase connectivity error when the check fails", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: "relation missing" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const result = await verifySupabaseConnectivity({
      env: {
        NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
      },
      fetch: fetchMock,
    });

    expect(result).toEqual({
      ok: false,
      error: "Supabase connectivity check failed.",
    });
  });
});
