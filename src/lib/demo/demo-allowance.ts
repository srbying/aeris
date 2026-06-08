import { z } from "zod";

const DEFAULT_DEMO_CHAT_TURN_LIMIT = 5;
const DEMO_VISITOR_COOKIE_MAX_AGE_SECONDS = 31_536_000;

export const DEMO_VISITOR_COOKIE_NAME = "aeris_demo_visitor";

type DemoAllowanceEnvironment = Record<string, string | undefined>;

type DemoTurnConsumption = {
  exhausted: boolean;
  remaining: number;
  turnsUsed: number;
};

export type DemoVisitorUsage = {
  firstSeenAt: string;
  lastSeenAt: string;
  turnsUsed: number;
  visitorKeyHash: string;
};

export type DemoAllowanceRepository = {
  checkAvailability(): Promise<void>;
  consumeTurn(input: {
    limit: number;
    visitorKeyHash: string;
  }): Promise<DemoTurnConsumption>;
  getUsageByVisitorToken(visitorToken: string): Promise<DemoVisitorUsage | null>;
};

export type DemoChatTurnDecision = {
  allowed: boolean;
  reason: "allowed" | "disabled" | "exhausted" | "unavailable";
  status: DemoAllowanceStatus;
  visitorTokenToSet: string | null;
};

export type DemoVisitorCookie = {
  httpOnly: true;
  maxAge: number;
  name: typeof DEMO_VISITOR_COOKIE_NAME;
  path: "/";
  sameSite: "lax";
  secure: boolean;
  value: string;
};

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

const demoUsageRowSchema = z
  .object({
    first_seen_at: z.string(),
    last_seen_at: z.string(),
    turns_used: z.number().int().nonnegative(),
    visitor_key_hash: z.string().min(1),
  })
  .strict();

const demoConsumeRowSchema = z
  .object({
    exhausted: z.boolean(),
    remaining: z.number().int().nonnegative(),
    turns_used: z.number().int().nonnegative(),
  })
  .strict();

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

export async function readDemoAllowanceStatus({
  env = process.env,
  repository,
  visitorToken,
}: {
  env?: DemoAllowanceEnvironment;
  repository: DemoAllowanceRepository;
  visitorToken: string | null;
}): Promise<DemoAllowanceStatus> {
  const limit = getDemoChatTurnLimit(env);
  const enabled = isDemoChatAllowanceEnabled(env);

  if (!enabled) {
    return {
      enabled,
      limit,
      remaining: limit,
      exhausted: false,
      availability: "available",
    };
  }

  try {
    if (visitorToken === null || visitorToken.trim() === "") {
      await repository.checkAvailability();

      return {
        enabled,
        limit,
        remaining: limit,
        exhausted: false,
        availability: "available",
      };
    }

    const usage = await repository.getUsageByVisitorToken(visitorToken);

    if (usage === null) {
      return {
        enabled,
        limit,
        remaining: limit,
        exhausted: false,
        availability: "available",
      };
    }

    return statusFromTurns({
      enabled,
      limit,
      turnsUsed: usage.turnsUsed,
    });
  } catch {
    return unavailableStatus(limit);
  }
}

export async function consumeDemoChatTurn({
  env = process.env,
  generateVisitorToken = () => crypto.randomUUID(),
  repository,
  visitorToken,
}: {
  env?: DemoAllowanceEnvironment;
  generateVisitorToken?: () => string;
  repository: DemoAllowanceRepository;
  visitorToken: string | null;
}): Promise<DemoChatTurnDecision> {
  const limit = getDemoChatTurnLimit(env);

  if (!isDemoChatAllowanceEnabled(env)) {
    return {
      allowed: true,
      reason: "disabled",
      status: {
        enabled: false,
        limit,
        remaining: limit,
        exhausted: false,
        availability: "available",
      },
      visitorTokenToSet: null,
    };
  }

  const existingVisitorToken = visitorToken?.trim() ?? "";
  const resolvedVisitorToken =
    existingVisitorToken.length > 0 ? existingVisitorToken : generateVisitorToken();
  const visitorTokenToSet = existingVisitorToken.length > 0 ? null : resolvedVisitorToken;

  try {
    const consumption = await repository.consumeTurn({
      limit,
      visitorKeyHash: await hashVisitorToken(resolvedVisitorToken),
    });

    if (consumption.exhausted) {
      return {
        allowed: false,
        reason: "exhausted",
        status: {
          enabled: true,
          limit,
          remaining: 0,
          exhausted: true,
          availability: "available",
        },
        visitorTokenToSet: null,
      };
    }

    return {
      allowed: true,
      reason: "allowed",
      status: {
        enabled: true,
        limit,
        remaining: consumption.remaining,
        exhausted: false,
        availability: "available",
      },
      visitorTokenToSet,
    };
  } catch {
    return {
      allowed: false,
      reason: "unavailable",
      status: unavailableStatus(limit),
      visitorTokenToSet: null,
    };
  }
}

export function buildDemoVisitorCookie(
  visitorToken: string,
  env: DemoAllowanceEnvironment = process.env,
): DemoVisitorCookie {
  return {
    name: DEMO_VISITOR_COOKIE_NAME,
    value: visitorToken,
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: env.NODE_ENV === "production" || env.VERCEL_ENV === "production",
    maxAge: DEMO_VISITOR_COOKIE_MAX_AGE_SECONDS,
  };
}

export function createInMemoryDemoAllowanceRepository(): DemoAllowanceRepository {
  const usageByVisitorKeyHash = new Map<string, DemoVisitorUsage>();

  return {
    async checkAvailability() {},

    async consumeTurn({ limit, visitorKeyHash }) {
      const existingUsage = usageByVisitorKeyHash.get(visitorKeyHash);

      if (existingUsage && existingUsage.turnsUsed >= limit) {
        return {
          turnsUsed: existingUsage.turnsUsed,
          remaining: 0,
          exhausted: true,
        };
      }

      const now = new Date().toISOString();
      const turnsUsed = (existingUsage?.turnsUsed ?? 0) + 1;
      usageByVisitorKeyHash.set(visitorKeyHash, {
        visitorKeyHash,
        turnsUsed,
        firstSeenAt: existingUsage?.firstSeenAt ?? now,
        lastSeenAt: now,
      });

      return {
        turnsUsed,
        remaining: Math.max(limit - turnsUsed, 0),
        exhausted: false,
      };
    },

    async getUsageByVisitorToken(visitorToken) {
      return usageByVisitorKeyHash.get(await hashVisitorToken(visitorToken)) ?? null;
    },
  };
}

export function createSupabaseDemoAllowanceRepository(
  env: DemoAllowanceEnvironment = process.env,
): DemoAllowanceRepository {
  return {
    async checkAvailability() {
      const config = getSupabaseDemoUsageConfig(env);
      const searchParams = new URLSearchParams({
        select: "visitor_key_hash",
        limit: "1",
      });
      const response = await fetch(
        `${config.url}/rest/v1/demo_visitor_usage?${searchParams.toString()}`,
        {
          headers: {
            apikey: config.key,
            Authorization: `Bearer ${config.key}`,
          },
        },
      );

      if (!response.ok) {
        throw new Error("Failed to check demo visitor usage availability.");
      }

      const rows: unknown = await response.json();

      if (!Array.isArray(rows)) {
        throw new Error("Demo visitor usage availability response was malformed.");
      }
    },

    async consumeTurn({ limit, visitorKeyHash }) {
      const config = getSupabaseDemoUsageConfig(env);
      const response = await fetch(`${config.url}/rest/v1/rpc/consume_demo_chat_turn`, {
        method: "POST",
        headers: {
          apikey: config.key,
          Authorization: `Bearer ${config.key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          p_visitor_key_hash: visitorKeyHash,
          p_limit: limit,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to consume demo chat turn.");
      }

      return parseConsumeResponse(await response.json());
    },

    async getUsageByVisitorToken(visitorToken) {
      const config = getSupabaseDemoUsageConfig(env);
      const visitorKeyHash = await hashVisitorToken(visitorToken);
      const searchParams = new URLSearchParams({
        select: "visitor_key_hash,turns_used,first_seen_at,last_seen_at",
        visitor_key_hash: `eq.${visitorKeyHash}`,
        limit: "1",
      });
      const response = await fetch(
        `${config.url}/rest/v1/demo_visitor_usage?${searchParams.toString()}`,
        {
          headers: {
            apikey: config.key,
            Authorization: `Bearer ${config.key}`,
          },
        },
      );

      if (!response.ok) {
        throw new Error("Failed to read demo visitor usage.");
      }

      const rows: unknown = await response.json();

      if (!Array.isArray(rows) || rows.length === 0) {
        return null;
      }

      return fromUsageRow(demoUsageRowSchema.parse(rows[0]));
    },
  };
}

async function hashVisitorToken(visitorToken: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(visitorToken),
  );

  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
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

function statusFromTurns({
  enabled,
  limit,
  turnsUsed,
}: {
  enabled: boolean;
  limit: number;
  turnsUsed: number;
}): DemoAllowanceStatus {
  const remaining = Math.max(limit - turnsUsed, 0);

  return {
    enabled,
    limit,
    remaining,
    exhausted: remaining === 0,
    availability: "available",
  };
}

function unavailableStatus(limit: number): DemoAllowanceStatus {
  return {
    enabled: true,
    limit,
    remaining: 0,
    exhausted: false,
    availability: "unavailable",
  };
}

function getSupabaseDemoUsageConfig(env: DemoAllowanceEnvironment): {
  key: string;
  url: string;
} {
  const url = env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key =
    env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  if (!url || !key) {
    throw new Error("Supabase demo usage environment variables are missing.");
  }

  return { url, key };
}

function parseConsumeResponse(rawValue: unknown): DemoTurnConsumption {
  const row = Array.isArray(rawValue) ? rawValue[0] : rawValue;
  const parsed = demoConsumeRowSchema.parse(row);

  return {
    turnsUsed: parsed.turns_used,
    remaining: parsed.remaining,
    exhausted: parsed.exhausted,
  };
}

function fromUsageRow(row: z.infer<typeof demoUsageRowSchema>): DemoVisitorUsage {
  return {
    visitorKeyHash: row.visitor_key_hash,
    turnsUsed: row.turns_used,
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
  };
}
