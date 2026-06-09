import { NextResponse } from "next/server";
import { getActivityRepository } from "../../../lib/activity/activity-repository";
import { parseGarminCsv } from "../../../lib/activity/garmin-parser";
import { uploadResponseSchema } from "../../../lib/activity/schema";
import { OWNER_UPLOAD_FORBIDDEN_MESSAGE } from "../../../lib/activity/upload-messages";
import {
  hasRunnerOwnerAccess,
  RUNNER_OWNER_ACCESS_COOKIE_NAME,
} from "../../../lib/runner-owner/owner-access";

export const dynamic = "force-dynamic";

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export async function POST(request: Request): Promise<Response> {
  try {
    if (
      !(await hasRunnerOwnerAccess({
        cookieValue: getCookieValue(request, RUNNER_OWNER_ACCESS_COOKIE_NAME),
      }))
    ) {
      return NextResponse.json(
        { error: OWNER_UPLOAD_FORBIDDEN_MESSAGE },
        { status: 403 },
      );
    }

    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "Upload a Garmin activity export CSV in the file field." },
        { status: 400 },
      );
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: "Garmin CSV uploads must be 10MB or smaller." },
        { status: 413 },
      );
    }

    const parsed = parseGarminCsv(await file.text());

    if (!parsed.isRecognized) {
      return NextResponse.json(
        { error: parsed.skipped[0]?.reason ?? "Unrecognized CSV format." },
        { status: 400 },
      );
    }

    const repositoryResult = await getActivityRepository().insertActivities(parsed.activities);
    const uploadResponse = {
      inserted: repositoryResult.inserted,
      skipped: parsed.skipped.length + repositoryResult.skipped,
      errors: [...parsed.skipped, ...repositoryResult.errors],
    };
    const validatedResponse = uploadResponseSchema.safeParse(uploadResponse);

    if (!validatedResponse.success) {
      return NextResponse.json(
        { error: "Upload response validation failed." },
        { status: 500 },
      );
    }

    const uploadFailure = validatedResponse.data.errors.find(
      (error) => error.code === "upload_failed",
    );

    if (uploadFailure) {
      return NextResponse.json(
        { error: uploadFailure.reason, ...validatedResponse.data },
        { status: 503 },
      );
    }

    return NextResponse.json(validatedResponse.data);
  } catch {
    return NextResponse.json(
      { error: "Upload failed. Try again after checking the CSV file." },
      { status: 500 },
    );
  }
}

function getCookieValue(request: Request, name: string): string | null {
  const cookieHeader = request.headers.get("cookie");

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
