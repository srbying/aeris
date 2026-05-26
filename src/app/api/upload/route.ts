import { NextResponse } from "next/server";
import { getActivityRepository } from "../../../lib/activity/activity-repository";
import { parseGarminCsv } from "../../../lib/activity/garmin-parser";
import { uploadResponseSchema } from "../../../lib/activity/schema";

export const dynamic = "force-dynamic";

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export async function POST(request: Request): Promise<Response> {
  try {
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
