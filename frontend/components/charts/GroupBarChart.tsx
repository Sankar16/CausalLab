"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

type Props = {
  title?: string;
  data: Record<string, number>;
  seriesLabel: string;
  valueFormatter?: (value: number) => string;
  fill?: string;
};

export default function GroupBarChart({
  title,
  data,
  seriesLabel,
  valueFormatter,
  fill = "#0f172a",
}: Props) {
  const chartData = Object.entries(data).map(([group, value]) => ({
    group,
    value,
  }));

  const maxValue = Math.max(...chartData.map((d) => d.value), 0);
  const paddedMax = maxValue === 0 ? 1 : maxValue * 1.1;

  return (
    <div className="w-full">
      {title ? <h3 className="mb-3 text-sm font-medium text-slate-600">{title}</h3> : null}

      <div className="h-80 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            margin={{ top: 16, right: 20, left: 8, bottom: 8 }}
          >
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="group" />
            <YAxis domain={[0, paddedMax]} allowDecimals={false} />
            <Tooltip
              formatter={(value: any) => {
                const numericValue =
                  typeof value === "number"
                    ? value
                    : typeof value === "string"
                    ? Number(value)
                    : NaN;

                if (!Number.isNaN(numericValue) && valueFormatter) {
                  return [valueFormatter(numericValue), seriesLabel];
                }

                if (!Number.isNaN(numericValue)) {
                  return [numericValue, seriesLabel];
                }

                return [String(value ?? ""), seriesLabel];
              }}
            />
            <Bar dataKey="value" name={seriesLabel} fill={fill} radius={[8, 8, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}