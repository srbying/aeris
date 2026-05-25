import { NextResponse } from "next/server";
import { getActivityRepository } from "../../../lib/activity/activity-repository";
import { serializePublicActivity } from "../../../lib/activity/serializers";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    const activities = await getActivityRepository().getActivities();
    return NextResponse.json(activities.map(serializePublicActivity));
  } catch {
    return NextResponse.json(
      { error: "Unable to load activities." },
      { status: 500 },
    );
  }
}
