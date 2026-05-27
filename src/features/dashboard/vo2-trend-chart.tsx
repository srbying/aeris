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
import type { Vo2Trend } from "../../lib/calculations/dashboard";
import { ChartShell, EmptyPanel } from "./chart-shell";
import { formatDateLabel } from "./formatters";

type Vo2TrendChartProps = {
  trend: Vo2Trend;
};

export function Vo2TrendChart({ trend }: Vo2TrendChartProps) {
  return (
    <ChartShell title="VO2 max" description="Garmin VO2 estimates across all uploaded history.">
      {!trend.hasEnoughData ? (
        <EmptyPanel />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="mb-4 text-xs font-medium text-zinc-600">Estimate</div>
          <div className="min-h-0 min-w-0 flex-1" data-testid="vo2-trend-chart">
            <ResponsiveContainer
              height="100%"
              initialDimension={{ width: 600, height: 256 }}
              minHeight={1}
              minWidth={1}
              width="100%"
            >
              <LineChart data={trend.points} margin={{ bottom: 8, left: 4, right: 4, top: 8 }}>
                <CartesianGrid stroke="#e4e4e7" strokeDasharray="3 3" />
                <XAxis
                  dataKey="date"
                  minTickGap={24}
                  tickFormatter={formatDateLabel}
                  tickLine={false}
                />
                <YAxis domain={["dataMin - 2", "dataMax + 2"]} tickLine={false} />
                <Tooltip
                  formatter={(value, name) => [Number(value).toFixed(1), name]}
                  labelFormatter={(label) => formatDateLabel(String(label))}
                />
                <Legend />
                <Line
                  dataKey="vo2maxEstimate"
                  dot={{ r: 3 }}
                  name="VO2 estimate"
                  stroke="#7c3aed"
                  strokeWidth={2}
                  type="monotone"
                />
                <Line
                  connectNulls
                  dataKey="rollingAverage7"
                  dot={false}
                  name="7-run average"
                  stroke="#4c1d95"
                  strokeWidth={2}
                  type="monotone"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </ChartShell>
  );
}
