const RUNNER_OWNER_ACCESS_COOKIE_MAX_AGE_SECONDS = 31_536_000;

export const RUNNER_OWNER_ACCESS_COOKIE_NAME = "aeris_runner_owner_access";

type RunnerOwnerAccessEnvironment = Record<string, string | undefined>;

export type RunnerOwnerAccessCookie = {
  httpOnly: true;
  maxAge: number;
  name: typeof RUNNER_OWNER_ACCESS_COOKIE_NAME;
  path: "/";
  sameSite: "lax";
  secure: boolean;
  value: string;
};

export async function buildRunnerOwnerAccessCookie({
  env = process.env,
  token,
}: {
  env?: RunnerOwnerAccessEnvironment;
  token: string;
}): Promise<RunnerOwnerAccessCookie | null> {
  const configuredToken = getRunnerOwnerAccessToken(env);

  if (!configuredToken || !(await isRunnerOwnerAccessTokenValid(configuredToken, token))) {
    return null;
  }

  return {
    name: RUNNER_OWNER_ACCESS_COOKIE_NAME,
    value: await hashRunnerOwnerAccessToken(configuredToken),
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: env.NODE_ENV === "production" || env.VERCEL_ENV === "production",
    maxAge: RUNNER_OWNER_ACCESS_COOKIE_MAX_AGE_SECONDS,
  };
}

export async function hasRunnerOwnerAccess({
  cookieValue,
  env = process.env,
}: {
  cookieValue: string | null;
  env?: RunnerOwnerAccessEnvironment;
}): Promise<boolean> {
  const configuredToken = getRunnerOwnerAccessToken(env);
  const trimmedCookieValue = cookieValue?.trim() ?? "";

  if (!configuredToken || trimmedCookieValue.length === 0) {
    return false;
  }

  return timingSafeEqual(
    trimmedCookieValue,
    await hashRunnerOwnerAccessToken(configuredToken),
  );
}

export async function hashRunnerOwnerAccessToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token),
  );

  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function isRunnerOwnerAccessTokenValid(
  configuredToken: string,
  candidateToken: string,
): Promise<boolean> {
  const trimmedCandidateToken = candidateToken.trim();

  if (trimmedCandidateToken.length === 0) {
    return false;
  }

  return timingSafeEqual(
    await hashRunnerOwnerAccessToken(trimmedCandidateToken),
    await hashRunnerOwnerAccessToken(configuredToken),
  );
}

function getRunnerOwnerAccessToken(
  env: RunnerOwnerAccessEnvironment,
): string | null {
  const token = env.RUNNER_OWNER_ACCESS_TOKEN?.trim();

  return token && token.length > 0 ? token : null;
}

function timingSafeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) {
    return false;
  }

  let difference = 0;

  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }

  return difference === 0;
}
