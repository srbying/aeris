type DeploymentEnvironment = Record<string, string | undefined>;

type DeploymentEnvironmentResult = {
  ok: boolean;
  missing: string[];
  invalid: string[];
};

type SupabaseConnectivityOptions = {
  env?: DeploymentEnvironment;
  fetch?: typeof fetch;
};

type SupabaseConnectivityResult =
  | { ok: true }
  | { ok: false; error: string };

const REQUIRED_ENVIRONMENT_KEYS: string[] = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "OPENAI_API_KEY",
  "LLM_PROVIDER",
  "LLM_MODEL",
  "RUNNER_OWNER_ACCESS_TOKEN",
];

export function validateDeploymentEnvironment(
  env: DeploymentEnvironment = process.env,
): DeploymentEnvironmentResult {
  const missing = REQUIRED_ENVIRONMENT_KEYS.filter((key) => !hasValue(env[key]));
  const invalid: string[] = [];
  const demoAllowanceEnabled = parseOptionalBoolean(env.DEMO_CHAT_ALLOWANCE_ENABLED);

  if (hasValue(env.NEXT_PUBLIC_OPENAI_API_KEY)) {
    invalid.push("NEXT_PUBLIC_OPENAI_API_KEY must not be set; OpenAI keys are server-only.");
  }

  if (hasValue(env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY)) {
    invalid.push(
      "NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY must not be set; Supabase service role keys are server-only.",
    );
  }

  if (hasValue(env.ACTIVITY_CONTEXT_MONTHS)) {
    if (!isPositiveInteger(env.ACTIVITY_CONTEXT_MONTHS)) {
      invalid.push("ACTIVITY_CONTEXT_MONTHS must be a positive integer.");
    }
  }

  if (demoAllowanceEnabled === null) {
    invalid.push("DEMO_CHAT_ALLOWANCE_ENABLED must be true or false when set.");
  }

  if (hasValue(env.DEMO_CHAT_TURN_LIMIT) && !isPositiveInteger(env.DEMO_CHAT_TURN_LIMIT)) {
    invalid.push("DEMO_CHAT_TURN_LIMIT must be a positive integer.");
  }

  if (demoAllowanceEnabled === true && !hasValue(env.SUPABASE_SERVICE_ROLE_KEY)) {
    missing.push("SUPABASE_SERVICE_ROLE_KEY");
  }

  return {
    ok: missing.length === 0 && invalid.length === 0,
    missing,
    invalid,
  };
}

export async function verifySupabaseConnectivity({
  env = process.env,
  fetch: fetcher = globalThis.fetch,
}: SupabaseConnectivityOptions = {}): Promise<SupabaseConnectivityResult> {
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const supabaseAnonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  if (!supabaseUrl || !supabaseAnonKey) {
    return { ok: false, error: "Supabase environment variables are missing." };
  }

  try {
    const response = await fetcher(`${supabaseUrl}/rest/v1/activities?select=id&limit=1`, {
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${supabaseAnonKey}`,
      },
    });

    if (!response.ok) {
      return { ok: false, error: "Supabase connectivity check failed." };
    }

    return { ok: true };
  } catch {
    return { ok: false, error: "Supabase connectivity check failed." };
  }
}

function hasValue(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function parseOptionalBoolean(value: string | undefined): boolean | null | undefined {
  if (!hasValue(value)) {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();

  if (normalized === "true") {
    return true;
  }

  if (normalized === "false") {
    return false;
  }

  return null;
}

function isPositiveInteger(value: string | undefined): boolean {
  const trimmedValue = value?.trim();

  if (!trimmedValue) {
    return false;
  }

  const parsed = Number(trimmedValue);

  return Number.isInteger(parsed) && parsed > 0;
}
