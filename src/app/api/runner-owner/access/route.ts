import { NextResponse } from "next/server";
import { z } from "zod";
import { buildRunnerOwnerAccessCookie } from "../../../../lib/runner-owner/owner-access";

export const dynamic = "force-dynamic";

const runnerOwnerAccessRequestSchema = z
  .object({
    token: z.string().trim().min(1),
  })
  .strict();

export async function POST(request: Request): Promise<Response> {
  const parsedRequest = await parseRunnerOwnerAccessRequest(request);

  if (!parsedRequest.success) {
    return notFoundResponse();
  }

  const cookie = await buildRunnerOwnerAccessCookie({
    token: parsedRequest.data.token,
  });

  if (cookie === null) {
    return notFoundResponse();
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(cookie);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

async function parseRunnerOwnerAccessRequest(
  request: Request,
): Promise<
  | { success: true; data: z.infer<typeof runnerOwnerAccessRequestSchema> }
  | { success: false }
> {
  try {
    const body: unknown = await request.json();
    const parsed = runnerOwnerAccessRequestSchema.safeParse(body);

    return parsed.success ? { success: true, data: parsed.data } : { success: false };
  } catch {
    return { success: false };
  }
}

function notFoundResponse(): NextResponse {
  const response = NextResponse.json({ error: "Not found." }, { status: 404 });
  response.headers.set("Cache-Control", "no-store");
  return response;
}
