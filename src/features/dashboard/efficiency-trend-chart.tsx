"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { EfficiencyTrend } from "../../lib/calculations/dashboard";
import {
  ChartPlot,
  ChartShell,
  EmptyPanel,
  chartTooltipContentStyle,
  chartTooltipEscapeViewBox,
  chartTooltipWrapperStyle,
} from "./chart-shell";
import { formatDateLabel } from "./formatters";

type EfficiencyTrendChartProps = {
  trend: EfficiencyTrend;
};

export function EfficiencyTrendChart({ trend }: EfficiencyTrendChartProps) {
  return (
    <ChartShell
      title="Aerobic efficiency"
      description="Speed per heartbeat for eligible runs in the last 6 months."
    >
      {!trend.hasEnoughData ? (
        <EmptyPanel />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="mb-4 text-xs font-medium text-zinc-600">Efficiency</div>
          <ChartPlot testId="efficiency-trend-chart">
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
                <YAxis
                  domain={["dataMin - 0.001", "dataMax + 0.001"]}
                  tickFormatter={(value) => Number(value).toFixed(3)}
                  tickLine={false}
                />
                <Tooltip
                  allowEscapeViewBox={chartTooltipEscapeViewBox}
                  contentStyle={chartTooltipContentStyle}
                  formatter={(value, name) => [Number(value).toFixed(4), name]}
                  labelFormatter={(label) => formatDateLabel(String(label))}
                  wrapperStyle={chartTooltipWrapperStyle}
                />
                <Legend />
                {trend.referenceEfficiency !== null ? (
                  <ReferenceLine
                    stroke="#71717a"
                    strokeDasharray="4 4"
                    y={trend.referenceEfficiency}
                  />
                ) : null}
                <Line
                  dataKey="efficiency"
                  dot={{ r: 3 }}
                  name="Run efficiency"
                  stroke="#059669"
                  strokeWidth={2}
                  type="monotone"
                />
                <Line
                  connectNulls
                  dataKey="rollingAverage30"
                  dot={false}
                  name="30-day average"
                  stroke="#0f766e"
                  strokeWidth={2}
                  type="monotone"
                />
              </LineChart>
            </ResponsiveContainer>
          </ChartPlot>
        </div>
      )}
    </ChartShell>
  );
}
