"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

type Props = {
  treatmentCounts: Record<string, number>;
  expectedProportions?: Record<string, number>;
};

export default function SrmSplitChart({
  treatmentCounts,
  expectedProportions,
}: Props) {
  const total = Object.values(treatmentCounts).reduce((sum, value) => sum + value, 0);

  const data = Object.keys(treatmentCounts).map((group) => {
    const observed = treatmentCounts[group];
    const expected = expectedProportions
      ? (expectedProportions[group] ?? 0) * total
      : total / Math.max(Object.keys(treatmentCounts).length, 1);

    const observedPct = total > 0 ? (observed / total) * 100 : 0;
    const expectedPct = total > 0 ? (expected / total) * 100 : 0;

    return {
      group,
      observed: Math.round(observed),
      expected: Math.round(expected),
      observedPct,
      expectedPct,
    };
  });

  return (
    <div className="h-80 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 16, right: 16, left: 16, bottom: 8 }}
          barCategoryGap={18}
        >
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis type="number" />
          <YAxis dataKey="group" type="category" width={90} />
          <Tooltip
            formatter={(value: any, name: any, payload: any) => {
              if (name === "Observed") {
                return [`${value} rows (${payload.payload.observedPct.toFixed(1)}%)`, name];
              }
              if (name === "Expected") {
                return [`${value} rows (${payload.payload.expectedPct.toFixed(1)}%)`, name];
              }
              return [String(value ?? ""), String(name ?? "")];
            }}
          />
          <Legend />
          <Bar dataKey="observed" name="Observed" fill="#0f172a" radius={[0, 8, 8, 0]} />
          <Bar dataKey="expected" name="Expected" fill="#94a3b8" radius={[0, 8, 8, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}