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
];

export function validateDeploymentEnvironment(
  env: DeploymentEnvironment = process.env,
): DeploymentEnvironmentResult {
  const missing = REQUIRED_ENVIRONMENT_KEYS.filter((key) => !hasValue(env[key]));
  const invalid: string[] = [];

  if (hasValue(env.NEXT_PUBLIC_OPENAI_API_KEY)) {
    invalid.push("NEXT_PUBLIC_OPENAI_API_KEY must not be set; OpenAI keys are server-only.");
  }

  if (hasValue(env.ACTIVITY_CONTEXT_MONTHS)) {
    const months = Number(env.ACTIVITY_CONTEXT_MONTHS);

    if (!Number.isInteger(months) || months < 1) {
      invalid.push("ACTIVITY_CONTEXT_MONTHS must be a positive integer.");
    }
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

function hasValue(value: string | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}
