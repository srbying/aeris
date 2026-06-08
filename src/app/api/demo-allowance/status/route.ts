import { NextResponse } from "next/server";
import {
  buildReadOnlyDemoAllowanceStatus,
  DEMO_VISITOR_COOKIE_NAME,
  readDemoAllowanceStatus,
} from "../../../../lib/demo/demo-allowance";
import { getDemoAllowanceRepository } from "../../../../lib/demo/dependencies";
import {
  hasRunnerOwnerAccess,
  RUNNER_OWNER_ACCESS_COOKIE_NAME,
} from "../../../../lib/runner-owner/owner-access";

export const dynamic = "force-dynamic";

export async function GET(request?: Request): Promise<Response> {
  try {
    if (
      await hasRunnerOwnerAccess({
        cookieValue: getCookieValue(request, RUNNER_OWNER_ACCESS_COOKIE_NAME),
      })
    ) {
      const anonymousStatus = buildReadOnlyDemoAllowanceStatus();
      const response = NextResponse.json({
        ...anonymousStatus,
        access: "runner_owner",
        enabled: false,
      });
      response.headers.set("Cache-Control", "no-store");
      return response;
    }

    const response = NextResponse.json(
      {
        ...(await readDemoAllowanceStatus({
          repository: getDemoAllowanceRepository(),
          visitorToken: getCookieValue(request, DEMO_VISITOR_COOKIE_NAME),
        })),
        access: "anonymous_demo",
      },
    );
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch {
    const response = NextResponse.json(
      { error: "Unable to load demo allowance status." },
      { status: 500 },
    );
    response.headers.set("Cache-Control", "no-store");
    return response;
  }
}

function getCookieValue(request: Request | undefined, name: string): string | null {
  const cookieHeader = request?.headers.get("Cookie") ?? request?.headers.get("cookie");

  if (!cookieHeader) {
    return null;
  }

  for (const cookie of cookieHeader.split(";")) {
    const [rawName, ...rawValueParts] = cookie.trim().split("=");

    if (rawName === name) {
      return decodeURIComponent(rawValueParts.join("="));
    }
  }

  return null;
}
