"use client";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from "recharts";

type Props = {
  data: Record<string, number>;
  seriesLabel: string;
  valueFormatter?: (value: number) => string;
};

export default function MetricComparisonChart({
  data,
  seriesLabel,
  valueFormatter,
}: Props) {
  const chartData = Object.entries(data).map(([group, value]) => ({
    group,
    value,
  }));

  return (
    <div className="h-80 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 16, right: 16, left: 0, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="group" />
          <YAxis />
          <ReferenceLine y={0} stroke="#94a3b8" />
          <Tooltip
            formatter={(value: any) => {
              const numericValue =
                typeof value === "number"
                  ? value
                  : typeof value === "string"
                  ? Number(value)
                  : NaN;

              if (!Number.isNaN(numericValue) && valueFormatter) {
                return valueFormatter(numericValue);
              }

              return String(value ?? "");
            }}
          />
          <Bar dataKey="value" name={seriesLabel} fill="#2563eb" radius={[8, 8, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}