"use client";

import { z } from "zod";

const DEMO_ALLOWANCE_STATUS_URL = "/api/demo-allowance/status";
const RUNNER_OWNER_ACCESS_FRAGMENT_KEY = "owner_access_token";
const RUNNER_OWNER_ACCESS_URL = "/api/runner-owner/access";

export const DemoAllowanceStatusSchema = z
  .object({
    access: z.enum(["anonymous_demo", "runner_owner"]),
    enabled: z.boolean(),
    limit: z.number().int().positive(),
    remaining: z.number().int().nonnegative(),
    exhausted: z.boolean(),
    availability: z.enum(["available", "unavailable"]),
  })
  .strict();

export type DemoAllowanceStatus = z.infer<typeof DemoAllowanceStatusSchema>;

let runnerOwnerAccessClaimPromise: Promise<void> | null = null;

export async function bootstrapDemoAllowanceStatus(): Promise<DemoAllowanceStatus | null> {
  await claimRunnerOwnerAccessFromFragment();
  return readDemoAllowanceStatus();
}

export async function readDemoAllowanceStatus(): Promise<DemoAllowanceStatus | null> {
  try {
    const response = await fetch(DEMO_ALLOWANCE_STATUS_URL);

    if (!response.ok) {
      return null;
    }

    const parsedStatus = DemoAllowanceStatusSchema.safeParse(await response.json());

    return parsedStatus.success ? parsedStatus.data : null;
  } catch {
    return null;
  }
}

async function claimRunnerOwnerAccessFromFragment(): Promise<void> {
  if (runnerOwnerAccessClaimPromise) {
    return runnerOwnerAccessClaimPromise;
  }

  const token = readRunnerOwnerAccessTokenFromFragment();

  if (token === null) {
    return;
  }

  stripLocationFragment();
  runnerOwnerAccessClaimPromise = claimRunnerOwnerAccessToken(token);

  return runnerOwnerAccessClaimPromise;
}

async function claimRunnerOwnerAccessToken(token: string): Promise<void> {
  try {
    await fetch(RUNNER_OWNER_ACCESS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
  } catch {
    return;
  }
}

function readRunnerOwnerAccessTokenFromFragment(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  const fragment = window.location.hash.startsWith("#")
    ? window.location.hash.slice(1)
    : window.location.hash;

  if (fragment.length === 0) {
    return null;
  }

  const token = new URLSearchParams(fragment)
    .get(RUNNER_OWNER_ACCESS_FRAGMENT_KEY)
    ?.trim();

  return token && token.length > 0 ? token : null;
}

function stripLocationFragment(): void {
  if (typeof window === "undefined") {
    return;
  }

  window.history.replaceState(
    null,
    document.title,
    `${window.location.pathname}${window.location.search}`,
  );
}
