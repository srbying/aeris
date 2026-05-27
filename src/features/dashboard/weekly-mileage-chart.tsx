"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { WeeklyMileagePoint } from "../../lib/calculations/weekly-mileage";
import { ChartShell, EmptyPanel } from "./chart-shell";
import { formatDateLabel } from "./formatters";

type WeeklyMileageChartProps = {
  data: WeeklyMileagePoint[];
  hasActivities: boolean;
};

export function WeeklyMileageChart({ data, hasActivities }: WeeklyMileageChartProps) {
  return (
    <ChartShell title="Weekly mileage" description="Total training distance across all activity types.">
      {!hasActivities ? (
        <EmptyPanel message="No mileage data yet." />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="mb-4 text-xs font-medium text-zinc-600">Distance (km)</div>
          <div className="min-h-0 min-w-0 flex-1" data-testid="weekly-mileage-chart">
            <ResponsiveContainer
              height="100%"
              initialDimension={{ width: 600, height: 256 }}
              minHeight={1}
              minWidth={1}
              width="100%"
            >
              <BarChart data={data} margin={{ bottom: 8, left: 4, right: 4, top: 8 }}>
                <CartesianGrid stroke="#e4e4e7" strokeDasharray="3 3" />
                <XAxis
                  dataKey="weekStart"
                  minTickGap={18}
                  tickFormatter={formatDateLabel}
                  tickLine={false}
                />
                <YAxis tickLine={false} />
                <Tooltip
                  formatter={(value) => [`${Number(value).toFixed(1)} km`, "Distance"]}
                  labelFormatter={(label) => formatDateLabel(String(label))}
                />
                <Bar dataKey="distanceKm" fill="#0f766e" name="Distance" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </ChartShell>
  );
}
