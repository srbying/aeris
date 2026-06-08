import { NextResponse } from "next/server";
import { buildReadOnlyDemoAllowanceStatus } from "../../../../lib/demo/demo-allowance";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    const response = NextResponse.json(buildReadOnlyDemoAllowanceStatus());
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
