import { z } from "zod";

const DEFAULT_DEMO_CHAT_TURN_LIMIT = 5;

type DemoAllowanceEnvironment = Record<string, string | undefined>;

export const demoAllowanceStatusSchema = z
  .object({
    enabled: z.boolean(),
    limit: z.number().int().positive(),
    remaining: z.number().int().nonnegative(),
    exhausted: z.boolean(),
    availability: z.enum(["available", "unavailable"]),
  })
  .strict();

export type DemoAllowanceStatus = z.infer<typeof demoAllowanceStatusSchema>;

export function buildReadOnlyDemoAllowanceStatus(
  env: DemoAllowanceEnvironment = process.env,
): DemoAllowanceStatus {
  const limit = getDemoChatTurnLimit(env);

  return {
    enabled: isDemoChatAllowanceEnabled(env),
    limit,
    remaining: limit,
    exhausted: false,
    availability: "available",
  };
}

function isDemoChatAllowanceEnabled(env: DemoAllowanceEnvironment): boolean {
  return env.DEMO_CHAT_ALLOWANCE_ENABLED?.trim().toLowerCase() === "true";
}

function getDemoChatTurnLimit(env: DemoAllowanceEnvironment): number {
  const rawValue = env.DEMO_CHAT_TURN_LIMIT;

  if (rawValue === undefined || rawValue.trim() === "") {
    return DEFAULT_DEMO_CHAT_TURN_LIMIT;
  }

  const parsed = Number(rawValue);

  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error("DEMO_CHAT_TURN_LIMIT must be a positive integer.");
  }

  return parsed;
}
