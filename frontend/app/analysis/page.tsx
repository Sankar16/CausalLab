"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import InfoTooltip from "@/components/InfoTooltip";
import { API_BASE_URL } from "@/lib/api";
import MetricComparisonChart from "@/components/charts/MetricComparisonChart";
import TrustScoreCard from "@/components/TrustScoreCard";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ScatterChart,
  Scatter,
  ZAxis,
} from "recharts";

type DiagnosticsResponse = {
  treatment_counts: Record<string, number>;
  srm: {
    chi_square_stat: number;
    p_value: number;
    is_suspected: boolean;
    expected_proportions?: Record<string, number>;
  };
  missing_outcome_by_group: Record<string, number>;
  outcome_summary: {
    metric_name: string;
    by_group: Record<string, number>;
  };
  warnings: string[];
};

type AnalysisResponse = {
  metric_type: "binary" | "continuous";
  outcome_column?: string;
  groups: {
    control_label: string;
    treatment_label: string;
  };
  sample_sizes: Record<string, number>;
  outcome_values?: Record<string, number>;
  outcome_rates?: Record<string, number>;
  outcome_means?: Record<string, number>;
  effect: {
    absolute_lift: number;
    relative_lift: number | null;
  };
  test_statistic: {
    test_name: string;
    stat: number;
    p_value: number;
  };
  confidence_interval_95: {
    low: number;
    high: number;
  };
  interpretation: string;
};

type TrustScoreResponse = {
  trust_score: number;
  decision: "Proceed" | "Proceed with Caution" | "Do Not Trust Yet";
  summary: string;
  reasons: string[];
  deductions: {
    factor: string;
    points: number;
    reason: string;
  }[];
  positive_signals: string[];
  biggest_risk: string | null;
  strongest_positive_signal: string | null;
  recommended_next_step: string;
};

function AbsoluteLiftChart({
  metricType,
  absoluteLift,
}: {
  metricType: "binary" | "continuous";
  absoluteLift: number;
}) {
  const displayValue = metricType === "binary" ? absoluteLift * 100 : absoluteLift;
  const minDomain = Math.min(0, displayValue * 1.15);
  const maxDomain = Math.max(0, displayValue * 1.15);

  const data = [{ name: "Absolute Lift", value: displayValue }];

  const formatter = (value: number) =>
    metricType === "binary" ? `${value.toFixed(2)} pp` : value.toFixed(2);

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 16, right: 16, left: 0, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="name" />
          <YAxis
            domain={[minDomain, maxDomain]}
            tickFormatter={(value) => formatter(Number(value))}
          />
          <ReferenceLine y={0} stroke="#94a3b8" />
          <Tooltip
            formatter={(value: any) => {
              const numeric = typeof value === "number" ? value : Number(value);
              return [formatter(numeric), "Absolute Lift"];
            }}
          />
          <Bar dataKey="value" fill="#0f172a" radius={[8, 8, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function ConfidenceIntervalChart({
  metricType,
  estimate,
  low,
  high,
}: {
  metricType: "binary" | "continuous";
  estimate: number;
  low: number;
  high: number;
}) {
  const scale = metricType === "binary" ? 100 : 1;

  const scaledLow = low * scale;
  const scaledEstimate = estimate * scale;
  const scaledHigh = high * scale;

  const minDomain = Math.min(0, scaledLow) - Math.abs(scaledHigh - scaledLow) * 0.25;
  const maxDomain = Math.max(0, scaledHigh) + Math.abs(scaledHigh - scaledLow) * 0.25;

  const chartData = [
    { x: scaledLow, y: 1, z: 8, label: "Lower bound" },
    { x: scaledEstimate, y: 1, z: 14, label: "Point estimate" },
    { x: scaledHigh, y: 1, z: 8, label: "Upper bound" },
  ];

  const formatter = (value: number) =>
    metricType === "binary" ? `${value.toFixed(2)} pp` : value.toFixed(2);

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 20, right: 24, left: 24, bottom: 20 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            type="number"
            dataKey="x"
            domain={[minDomain, maxDomain]}
            tickFormatter={(value) => formatter(Number(value))}
          />
          <YAxis type="number" dataKey="y" domain={[0, 2]} hide />
          <ZAxis type="number" dataKey="z" range={[60, 220]} />
          <Tooltip
            cursor={{ strokeDasharray: "3 3" }}
            formatter={(value: any, _name: any, props: any) => {
              if (props?.payload?.label) {
                return [formatter(props.payload.x), props.payload.label];
              }
              return [String(value ?? ""), ""];
            }}
          />
          <ReferenceLine x={0} stroke="#94a3b8" />
          <ReferenceLine
            segment={[
              { x: scaledLow, y: 1 },
              { x: scaledHigh, y: 1 },
            ]}
            stroke="#93c5fd"
            strokeWidth={4}
          />
          <Scatter data={chartData} fill="#2563eb" />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}

function AnalysisPageContent() {
  const searchParams = useSearchParams();

  const fileId = searchParams.get("file_id") || "";
  const treatmentColumn = searchParams.get("treatment_column") || "";
  const outcomeColumn = searchParams.get("outcome_column") || "";
  const userIdColumn = searchParams.get("user_id_column") || "";
  const timestampColumn = searchParams.get("timestamp_column") || "";
  const prePeriodColumn = searchParams.get("pre_period_column") || "";
  const covariatesParam = searchParams.get("covariates") || "";

  const covariateColumns = covariatesParam
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalysisResponse | null>(null);
  const [diagnostics, setDiagnostics] = useState<DiagnosticsResponse | null>(null);
  const [trust, setTrust] = useState<TrustScoreResponse | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchDiagnosticsAndTrust = async () => {
      if (!fileId || !treatmentColumn || !outcomeColumn) return;

      try {
        const response = await fetch(`${API_BASE_URL}/diagnostics`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            file_id: fileId,
            treatment_column: treatmentColumn,
            outcome_column: outcomeColumn,
            user_id_column: userIdColumn || null,
            timestamp_column: timestampColumn || null,
            covariate_columns: covariateColumns,
            pre_period_column: prePeriodColumn || null,
          }),
        });

        if (response.ok) {
          const data: DiagnosticsResponse = await response.json();
          setDiagnostics(data);
        }

        const trustResponse = await fetch(`${API_BASE_URL}/trust-score`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            file_id: fileId,
            treatment_column: treatmentColumn,
            outcome_column: outcomeColumn,
            user_id_column: userIdColumn || null,
            timestamp_column: timestampColumn || null,
            covariate_columns: covariateColumns,
            pre_period_column: prePeriodColumn || null,
            expected_proportions: null,
          }),
        });

        if (trustResponse.ok) {
          const trustData: TrustScoreResponse = await trustResponse.json();
          setTrust(trustData);
        }
      } catch {
        // keep page usable
      }
    };

    fetchDiagnosticsAndTrust();
  }, [
    fileId,
    treatmentColumn,
    outcomeColumn,
    userIdColumn,
    timestampColumn,
    prePeriodColumn,
    covariateColumns,
  ]);

  const handleRunAnalysis = async () => {
    if (!fileId || !treatmentColumn || !outcomeColumn) {
      setError("Missing required parameters in URL.");
      return;
    }

    try {
      setLoading(true);
      setError("");

      const response = await fetch(`${API_BASE_URL}/analyze`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          file_id: fileId,
          treatment_column: treatmentColumn,
          outcome_column: outcomeColumn,
          user_id_column: userIdColumn || null,
          timestamp_column: timestampColumn || null,
          covariate_columns: covariateColumns,
          pre_period_column: prePeriodColumn || null,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || "Analysis failed.");
      }

      const data: AnalysisResponse = await response.json();
      setResult(data);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Something went wrong while running analysis.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const controlLabel = result?.groups.control_label ?? "control";
  const treatmentLabel = result?.groups.treatment_label ?? "treatment";

  const hasWarnings = diagnostics && diagnostics.warnings.length > 0;
  const hasSevereWarning = diagnostics?.srm.is_suspected ?? false;

  const metricComparisonData = useMemo(() => {
    if (!result) return null;

    if (result.metric_type === "binary") {
      return {
        [controlLabel]: (result.outcome_rates?.[controlLabel] ?? 0) * 100,
        [treatmentLabel]: (result.outcome_rates?.[treatmentLabel] ?? 0) * 100,
      };
    }

    return {
      [controlLabel]: result.outcome_means?.[controlLabel] ?? 0,
      [treatmentLabel]: result.outcome_means?.[treatmentLabel] ?? 0,
    };
  }, [result, controlLabel, treatmentLabel]);

  const metricValueFormatter = (value: number) => {
    if (!result) return value.toFixed(2);
    return result.metric_type === "binary" ? `${value.toFixed(2)}%` : value.toFixed(2);
  };

  const ciText = result
    ? result.metric_type === "binary"
      ? `[${(result.confidence_interval_95.low * 100).toFixed(2)}, ${(
          result.confidence_interval_95.high * 100
        ).toFixed(2)}] percentage points`
      : `[${result.confidence_interval_95.low.toFixed(2)}, ${result.confidence_interval_95.high.toFixed(
          2
        )}]`
    : "";

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-900">
      <div className="mx-auto max-w-6xl">
        <a
          href={`/diagnostics?file_id=${encodeURIComponent(
            fileId
          )}&treatment_column=${encodeURIComponent(
            treatmentColumn
          )}&outcome_column=${encodeURIComponent(
            outcomeColumn
          )}&user_id_column=${encodeURIComponent(
            userIdColumn
          )}&timestamp_column=${encodeURIComponent(
            timestampColumn
          )}&pre_period_column=${encodeURIComponent(
            prePeriodColumn
          )}&covariates=${encodeURIComponent(covariateColumns.join(","))}`}
          className="text-sm text-slate-500 hover:text-slate-900"
        >
          ← Back to diagnostics
        </a>

        <h1 className="mt-4 text-3xl font-bold">A/B Test Analysis</h1>
        <p className="mt-2 text-slate-600">
          Estimate lift, significance, and confidence intervals for the selected experiment outcome.
        </p>

        <div className="mt-4 rounded-lg bg-slate-100 p-4 text-sm text-slate-700">
          <p><span className="font-medium">File ID:</span> {fileId || "Not found"}</p>
          <p><span className="font-medium">Treatment Column:</span> {treatmentColumn || "Not found"}</p>
          <p><span className="font-medium">Outcome Column:</span> {outcomeColumn || "Not found"}</p>
        </div>

        {trust && (
          <div className="mt-6">
            <TrustScoreCard trust={trust} />
          </div>
        )}

        {diagnostics && (
          <>
            {hasSevereWarning ? (
              <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-6 shadow-sm">
                <h2 className="text-xl font-semibold text-red-800">Interpret with Caution</h2>
                <p className="mt-2 text-red-700">
                  This experiment shows analysis results, but diagnostics detected serious issues
                  such as sample ratio mismatch. Statistical significance alone may not make this
                  result trustworthy.
                </p>
                {diagnostics.warnings.length > 0 && (
                  <ul className="mt-3 list-disc pl-5 text-red-700">
                    {diagnostics.warnings.map((warning, index) => (
                      <li key={index}>{warning}</li>
                    ))}
                  </ul>
                )}
              </div>
            ) : hasWarnings ? (
              <div className="mt-6 rounded-2xl border border-yellow-200 bg-yellow-50 p-6 shadow-sm">
                <h2 className="text-xl font-semibold text-yellow-800">Use Caution</h2>
                <p className="mt-2 text-yellow-700">
                  Diagnostics detected some issues that could affect confidence in the result.
                </p>
                <ul className="mt-3 list-disc pl-5 text-yellow-700">
                  {diagnostics.warnings.map((warning, index) => (
                    <li key={index}>{warning}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-6 shadow-sm">
                <h2 className="text-xl font-semibold text-emerald-800">
                  Healthy Experiment Signals
                </h2>
                <p className="mt-2 text-emerald-700">
                  No major diagnostic warnings were detected before analysis.
                </p>
              </div>
            )}
          </>
        )}

        <div className="mt-6">
          <button
            onClick={handleRunAnalysis}
            disabled={loading}
            className="rounded-xl bg-slate-900 px-5 py-3 text-white transition hover:bg-slate-700 disabled:opacity-60"
          >
            {loading ? "Running Analysis..." : "Run Analysis"}
          </button>
        </div>

        {loading && (
          <div className="mt-6 rounded-lg border border-blue-200 bg-blue-50 p-4 text-blue-700">
            Running analysis and updating charts...
          </div>
        )}

        {error && (
          <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
            {error}
          </div>
        )}

        {result && metricComparisonData && (
          <div className="mt-8 space-y-6">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-semibold">
                  {result.metric_type === "binary" ? "Outcome Rates" : "Outcome Means"}
                </h2>
                <InfoTooltip text="Direct comparison of the selected outcome across control and treatment groups." />
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div className="rounded-xl bg-slate-100 p-4">
                  <p className="text-sm text-slate-500">{controlLabel}</p>
                  <p className="mt-1 text-xl font-semibold">
                    {metricValueFormatter(metricComparisonData[controlLabel])}
                  </p>
                </div>
                <div className="rounded-xl bg-slate-100 p-4">
                  <p className="text-sm text-slate-500">{treatmentLabel}</p>
                  <p className="mt-1 text-xl font-semibold">
                    {metricValueFormatter(metricComparisonData[treatmentLabel])}
                  </p>
                </div>
              </div>

              <div className="mt-6">
                <MetricComparisonChart
                  data={metricComparisonData}
                  seriesLabel={result.metric_type === "binary" ? "Rate" : "Mean"}
                  valueFormatter={metricValueFormatter}
                />
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-semibold">Effect Size</h2>
                  <InfoTooltip text="Absolute lift shows the raw change between treatment and control. Relative lift shows the percentage change relative to control." />
                </div>

                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div className="rounded-xl bg-slate-100 p-4">
                    <p className="text-sm text-slate-500">Absolute Lift</p>
                    <p className="mt-1 text-xl font-semibold">
                      {result.metric_type === "binary"
                        ? `${(result.effect.absolute_lift * 100).toFixed(2)} pp`
                        : result.effect.absolute_lift.toFixed(2)}
                    </p>
                  </div>
                  <div className="rounded-xl bg-slate-100 p-4">
                    <p className="text-sm text-slate-500">Relative Lift</p>
                    <p className="mt-1 text-xl font-semibold">
                      {result.effect.relative_lift !== null
                        ? `${(result.effect.relative_lift * 100).toFixed(2)}%`
                        : "N/A"}
                    </p>
                  </div>
                </div>

                <div className="mt-6">
                  <AbsoluteLiftChart
                    metricType={result.metric_type}
                    absoluteLift={result.effect.absolute_lift}
                  />
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-semibold">Confidence Interval</h2>
                  <InfoTooltip text="The confidence interval shows the plausible range for the treatment effect. If it crosses zero, the effect may not be statistically distinguishable from no effect." />
                </div>

                <div className="mt-4 rounded-xl bg-slate-100 p-4">
                  <p className="text-sm text-slate-500">95% Confidence Interval</p>
                  <p className="mt-1 text-xl font-semibold">{ciText}</p>
                </div>

                <div className="mt-6">
                  <ConfidenceIntervalChart
                    metricType={result.metric_type}
                    estimate={result.effect.absolute_lift}
                    low={result.confidence_interval_95.low}
                    high={result.confidence_interval_95.high}
                  />
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-semibold">Statistical Test</h2>
                <InfoTooltip text="This section summarizes the hypothesis test used to compare control and treatment, including the test statistic and p-value." />
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-4">
                <div className="rounded-xl bg-slate-100 p-4">
                  <p className="text-sm text-slate-500">Test Name</p>
                  <p className="mt-1 font-semibold">{result.test_statistic.test_name}</p>
                </div>
                <div className="rounded-xl bg-slate-100 p-4">
                  <p className="text-sm text-slate-500">Test Statistic</p>
                  <p className="mt-1 font-semibold">{result.test_statistic.stat}</p>
                </div>
                <div className="rounded-xl bg-slate-100 p-4">
                  <p className="text-sm text-slate-500">P-value</p>
                  <p className="mt-1 font-semibold">{result.test_statistic.p_value}</p>
                </div>
                <div className="rounded-xl bg-slate-100 p-4">
                  <p className="text-sm text-slate-500">Significance</p>
                  <p
                    className={`mt-1 font-semibold ${
                      result.test_statistic.p_value < 0.05 ? "text-emerald-700" : "text-red-700"
                    }`}
                  >
                    {result.test_statistic.p_value < 0.05
                      ? "Statistically Significant"
                      : "Not Significant"}
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-blue-200 bg-blue-50 p-6 shadow-sm">
              <h2 className="text-xl font-semibold text-blue-900">Interpretation</h2>
              <p className="mt-3 text-blue-900">{result.interpretation}</p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <a
                href={`/report?file_id=${encodeURIComponent(
                  fileId
                )}&treatment_column=${encodeURIComponent(
                  treatmentColumn
                )}&outcome_column=${encodeURIComponent(
                  outcomeColumn
                )}&user_id_column=${encodeURIComponent(
                  userIdColumn
                )}&timestamp_column=${encodeURIComponent(
                  timestampColumn
                )}&pre_period_column=${encodeURIComponent(
                  prePeriodColumn
                )}&covariates=${encodeURIComponent(covariateColumns.join(","))}`}
                className="inline-block rounded-xl bg-emerald-700 px-5 py-3 text-white transition hover:bg-emerald-600"
              >
                Open Report
              </a>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

export default function AnalysisPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-900">
          <div className="mx-auto max-w-6xl rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
            Loading analysis page...
          </div>
        </main>
      }
    >
      <AnalysisPageContent />
    </Suspense>
  );
}