"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { PaceTrendPoint } from "../../lib/calculations/dashboard";
import { EmptyPanel, ChartShell } from "./chart-shell";
import { formatDateLabel, formatPace } from "./formatters";

type PaceHeartRateChartProps = {
  data: PaceTrendPoint[];
};

export function PaceHeartRateChart({ data }: PaceHeartRateChartProps) {
  return (
    <ChartShell
      title="Pace vs heart rate"
      description="Eligible runs from the last 90 days."
    >
      {data.length < 2 ? (
        <EmptyPanel />
      ) : (
        <div>
          <div className="mb-3 flex flex-wrap gap-x-5 gap-y-1 text-xs font-medium text-zinc-600">
            <span>Pace (min/km)</span>
            <span>Heart rate (bpm)</span>
          </div>
          <div className="h-64 min-w-0" data-testid="pace-heart-rate-chart">
            <ResponsiveContainer
              height="100%"
              initialDimension={{ width: 600, height: 256 }}
              minHeight={1}
              minWidth={1}
              width="100%"
            >
              <LineChart data={data} margin={{ bottom: 8, left: 4, right: 4, top: 8 }}>
                <CartesianGrid stroke="#e4e4e7" strokeDasharray="3 3" />
                <XAxis
                  dataKey="date"
                  minTickGap={24}
                  tickFormatter={formatDateLabel}
                  tickLine={false}
                />
                <YAxis
                  dataKey="paceSecPerKm"
                  domain={["dataMin - 15", "dataMax + 15"]}
                  orientation="left"
                  reversed
                  tickFormatter={(value) => formatPace(Number(value)).replace(" /km", "")}
                  tickLine={false}
                  yAxisId="pace"
                />
                <YAxis
                  dataKey="avgHr"
                  domain={["dataMin - 5", "dataMax + 5"]}
                  orientation="right"
                  tickFormatter={(value) => `${Math.round(Number(value))}`}
                  tickLine={false}
                  yAxisId="heart-rate"
                />
                <Tooltip
                  formatter={(value, name) => {
                    if (name === "Pace") {
                      return [formatPace(Number(value)), name];
                    }

                    return [`${Math.round(Number(value))} bpm`, name];
                  }}
                  labelFormatter={(label) => formatDateLabel(String(label))}
                />
                <Legend />
                <Line
                  dataKey="paceSecPerKm"
                  dot={{ r: 3 }}
                  name="Pace"
                  stroke="#2563eb"
                  strokeWidth={2}
                  type="monotone"
                  yAxisId="pace"
                />
                <Line
                  dataKey="avgHr"
                  dot={{ r: 3 }}
                  name="Heart rate"
                  stroke="#dc2626"
                  strokeWidth={2}
                  type="monotone"
                  yAxisId="heart-rate"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </ChartShell>
  );
}
