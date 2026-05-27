"use client";

import type { Activity } from "../../lib/activity/types";
import {
  formatActivityDate,
  formatDistance,
  formatDuration,
  formatNumber,
  formatPace,
} from "./formatters";

type ActivityHistoryProps = {
  activities: Activity[];
  id?: string;
};

export function ActivityHistory({ activities, id }: ActivityHistoryProps) {
  return (
    <section
      aria-label="Activity history"
      className="rounded-lg border border-zinc-200 bg-white shadow-sm shadow-zinc-200/60"
      id={id}
    >
      <div className="flex flex-col gap-2 p-4">
        <div className="flex min-w-0 flex-col gap-2">
          <h3 className="text-base font-semibold leading-6 text-zinc-950">Activity history</h3>
          <p className="text-sm text-zinc-600">Last 10 uploaded activities.</p>
        </div>
      </div>

      <div className="border-t border-zinc-200 p-4">
        {activities.length === 0 ? (
          <div className="rounded-md border border-dashed border-zinc-300 bg-zinc-50 px-4 py-10 text-center text-sm font-medium text-zinc-500">
            No activities uploaded yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-xs uppercase text-zinc-500">
                  <th className="py-2 pr-4 font-medium">Date</th>
                  <th className="py-2 pr-4 font-medium">Type</th>
                  <th className="py-2 pr-4 font-medium">Distance</th>
                  <th className="py-2 pr-4 font-medium">Duration</th>
                  <th className="py-2 pr-4 font-medium">Pace</th>
                  <th className="py-2 pr-4 font-medium">HR</th>
                  <th className="py-2 font-medium">VO2</th>
                </tr>
              </thead>
              <tbody>
                {activities.map((activity) => (
                  <tr className="border-b border-zinc-100 last:border-0" key={activity.id}>
                    <td className="py-2 pr-4 text-zinc-800">
                      {formatActivityDate(activity.activityDate)}
                    </td>
                    <td className="py-2 pr-4 font-medium text-zinc-950">
                      {activity.activityType}
                    </td>
                    <td className="py-2 pr-4 text-zinc-800">
                      {formatDistance(activity.distanceKm)}
                    </td>
                    <td className="py-2 pr-4 text-zinc-800">
                      {formatDuration(activity.durationSeconds)}
                    </td>
                    <td className="py-2 pr-4 text-zinc-800">
                      {formatPace(activity.avgPaceSecPerKm)}
                    </td>
                    <td className="py-2 pr-4 text-zinc-800">
                      {formatNumber(activity.avgHr, "No HR")}
                    </td>
                    <td className="py-2 text-zinc-800">
                      {formatNumber(activity.vo2maxEstimate, "No VO2")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
