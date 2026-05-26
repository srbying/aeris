// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import {
  validateDeploymentEnvironment,
  verifySupabaseConnectivity,
} from "../../src/lib/config/deployment-health";

describe("deployment health checks", () => {
  it("accepts the required production environment without exposing OpenAI keys", () => {
    const result = validateDeploymentEnvironment({
      NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
      OPENAI_API_KEY: "server-key",
      LLM_PROVIDER: "openai",
      LLM_MODEL: "gpt-5.5",
      ACTIVITY_CONTEXT_MONTHS: "12",
    });

    expect(result).toEqual({
      ok: true,
      missing: [],
      invalid: [],
    });
  });

  it("reports missing deployment variables and blocks client-exposed OpenAI keys", () => {
    const result = validateDeploymentEnvironment({
      NEXT_PUBLIC_SUPABASE_URL: "",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
      NEXT_PUBLIC_OPENAI_API_KEY: "client-leak",
      OPENAI_API_KEY: "",
      LLM_PROVIDER: "openai",
      LLM_MODEL: "gpt-5.5",
      ACTIVITY_CONTEXT_MONTHS: "0",
    });

    expect(result.ok).toBe(false);
    expect(result.missing).toEqual(
      expect.arrayContaining(["NEXT_PUBLIC_SUPABASE_URL", "OPENAI_API_KEY"]),
    );
    expect(result.invalid).toEqual(
      expect.arrayContaining([
        "NEXT_PUBLIC_OPENAI_API_KEY must not be set; OpenAI keys are server-only.",
        "ACTIVITY_CONTEXT_MONTHS must be a positive integer.",
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
