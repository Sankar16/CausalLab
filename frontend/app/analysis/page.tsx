"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import InfoTooltip from "@/components/InfoTooltip";
import { API_BASE_URL } from "@/lib/api";
import GroupBarChart from "@/components/charts/GroupBarChart";
import MetricComparisonChart from "@/components/charts/MetricComparisonChart";
import {
  ResponsiveContainer,
  ComposedChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Bar,
  ReferenceLine,
  Scatter,
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

function ConfidenceIntervalChart({
  metricType,
  absoluteLift,
  low,
  high,
}: {
  metricType: "binary" | "continuous";
  absoluteLift: number;
  low: number;
  high: number;
}) {
  const scale = metricType === "binary" ? 100 : 1;

  const data = [
    {
      name: "Lift",
      low: low * scale,
      estimate: absoluteLift * scale,
      high: high * scale,
    },
  ];

  const formatter = (value: number) => {
    return metricType === "binary" ? `${value.toFixed(2)} pp` : value.toFixed(2);
  };

  return (
    <div className="h-80 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 20, right: 20, left: 10, bottom: 10 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="name" />
          <YAxis />
          <Tooltip
            formatter={(value: any, name: any) => {
              const numeric = typeof value === "number" ? value : Number(value);
              if (!Number.isNaN(numeric)) {
                return [formatter(numeric), name];
              }
              return [String(value ?? ""), String(name ?? "")];
            }}
          />
          <ReferenceLine y={0} stroke="#94a3b8" />
          <Bar dataKey="high" fill="#dbeafe" radius={[8, 8, 0, 0]} name="Upper bound" />
          <Bar dataKey="low" fill="#bfdbfe" radius={[8, 8, 0, 0]} name="Lower bound" />
          <Scatter dataKey="estimate" fill="#1d4ed8" name="Point estimate" />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function EffectBreakdownChart({
  metricType,
  absoluteLift,
  relativeLift,
}: {
  metricType: "binary" | "continuous";
  absoluteLift: number;
  relativeLift: number | null;
}) {
  const data = [
    {
      name: "Absolute Lift",
      value: metricType === "binary" ? absoluteLift * 100 : absoluteLift,
    },
    {
      name: "Relative Lift",
      value: relativeLift !== null ? relativeLift * 100 : 0,
    },
  ];

  const formatter = (value: number, label: string) => {
    if (label === "Absolute Lift") {
      return metricType === "binary" ? `${value.toFixed(2)} pp` : value.toFixed(2);
    }
    return `${value.toFixed(2)}%`;
  };

  return (
    <div className="h-80 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 16, right: 16, left: 0, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="name" />
          <YAxis />
          <Tooltip
            formatter={(value: any, name: any, payload: any) => {
              const numeric = typeof value === "number" ? value : Number(value);
              if (!Number.isNaN(numeric)) {
                return [formatter(numeric, payload?.payload?.name ?? ""), name];
              }
              return [String(value ?? ""), String(name ?? "")];
            }}
          />
          <ReferenceLine y={0} stroke="#94a3b8" />
          <Bar dataKey="value" fill="#0f172a" radius={[8, 8, 0, 0]} />
        </ComposedChart>
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
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchDiagnostics = async () => {
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

        if (!response.ok) return;

        const data: DiagnosticsResponse = await response.json();
        setDiagnostics(data);
      } catch {
        // keep page usable
      }
    };

    fetchDiagnostics();
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
      setResult(null);

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
        [controlLabel]: result.outcome_rates?.[controlLabel] ?? 0,
        [treatmentLabel]: result.outcome_rates?.[treatmentLabel] ?? 0,
      };
    }

    return {
      [controlLabel]: result.outcome_means?.[controlLabel] ?? 0,
      [treatmentLabel]: result.outcome_means?.[treatmentLabel] ?? 0,
    };
  }, [result, controlLabel, treatmentLabel]);

  const metricValueFormatter = (value: number) => {
    if (!result) return value.toFixed(2);
    return result.metric_type === "binary" ? `${(value * 100).toFixed(2)}%` : value.toFixed(2);
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
          <p>
            <span className="font-medium">File ID:</span> {fileId || "Not found"}
          </p>
          <p>
            <span className="font-medium">Treatment Column:</span>{" "}
            {treatmentColumn || "Not found"}
          </p>
          <p>
            <span className="font-medium">Outcome Column:</span> {outcomeColumn || "Not found"}
          </p>
        </div>

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
                <h2 className="text-xl font-semibold text-emerald-800">Healthy Experiment Signals</h2>
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
                  <EffectBreakdownChart
                    metricType={result.metric_type}
                    absoluteLift={result.effect.absolute_lift}
                    relativeLift={result.effect.relative_lift}
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
                    absoluteLift={result.effect.absolute_lift}
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