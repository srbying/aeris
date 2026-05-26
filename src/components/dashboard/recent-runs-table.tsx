import type { Activity } from "../../lib/activity/types";
import {
  formatActivityDate,
  formatDistance,
  formatDuration,
  formatNumber,
  formatPace,
} from "./formatters";

type RecentRunsTableProps = {
  activities: Activity[];
};

export function RecentRunsTable({ activities }: RecentRunsTableProps) {
  return (
    <section className="border border-zinc-200 bg-white p-4">
      <div className="mb-4">
        <h3 className="text-base font-semibold text-zinc-950">Recent activities</h3>
        <p className="mt-1 text-sm text-zinc-600">Last 10 uploaded activities.</p>
      </div>

      {activities.length === 0 ? (
        <div className="border border-dashed border-zinc-300 bg-zinc-50 px-4 py-10 text-center text-sm font-medium text-zinc-500">
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
                  <td className="py-3 pr-4 text-zinc-800">{formatActivityDate(activity.activityDate)}</td>
                  <td className="py-3 pr-4 font-medium text-zinc-950">{activity.activityType}</td>
                  <td className="py-3 pr-4 text-zinc-800">{formatDistance(activity.distanceKm)}</td>
                  <td className="py-3 pr-4 text-zinc-800">{formatDuration(activity.durationSeconds)}</td>
                  <td className="py-3 pr-4 text-zinc-800">{formatPace(activity.avgPaceSecPerKm)}</td>
                  <td className="py-3 pr-4 text-zinc-800">
                    {formatNumber(activity.avgHr, "No HR")}
                  </td>
                  <td className="py-3 text-zinc-800">
                    {formatNumber(activity.vo2maxEstimate, "No VO2")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
