"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";

type AnalysisResponse = {
  metric_type: string;
  groups: {
    control_label: string;
    treatment_label: string;
  };
  sample_sizes: Record<string, number>;
  conversion_counts: Record<string, number>;
  conversion_rates: Record<string, number>;
  effect: {
    absolute_lift: number;
    relative_lift: number | null;
  };
  test_statistic: {
    z_stat: number;
    p_value: number;
  };
  confidence_interval_95: {
    low: number;
    high: number;
  };
  interpretation: string;
};

export default function AnalysisPage() {
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
  const [error, setError] = useState("");

  const handleRunAnalysis = async () => {
    if (!fileId || !treatmentColumn || !outcomeColumn) {
      setError("Missing required parameters in URL.");
      return;
    }

    try {
      setLoading(true);
      setError("");
      setResult(null);

      const response = await fetch("http://127.0.0.1:8000/analyze", {
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

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-900">
      <div className="mx-auto max-w-5xl">
        <a href="/diagnostics" className="text-sm text-slate-500 hover:text-slate-900">
          ← Back to diagnostics
        </a>

        <h1 className="mt-4 text-3xl font-bold">A/B Test Analysis</h1>
        <p className="mt-2 text-slate-600">
          Estimate lift, significance, and confidence intervals for the selected binary outcome.
        </p>

        <div className="mt-4 rounded-lg bg-slate-100 p-4 text-sm text-slate-700">
          <p><span className="font-medium">File ID:</span> {fileId || "Not found"}</p>
          <p><span className="font-medium">Treatment Column:</span> {treatmentColumn || "Not found"}</p>
          <p><span className="font-medium">Outcome Column:</span> {outcomeColumn || "Not found"}</p>
        </div>

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

        {result && (
          <div className="mt-8 space-y-6">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-xl font-semibold">Conversion Rates</h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div className="rounded-xl bg-slate-100 p-4">
                  <p className="text-sm text-slate-500">{controlLabel}</p>
                  <p className="mt-1 text-xl font-semibold">
                    {(result.conversion_rates[controlLabel] * 100).toFixed(2)}%
                  </p>
                </div>
                <div className="rounded-xl bg-slate-100 p-4">
                  <p className="text-sm text-slate-500">{treatmentLabel}</p>
                  <p className="mt-1 text-xl font-semibold">
                    {(result.conversion_rates[treatmentLabel] * 100).toFixed(2)}%
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-xl font-semibold">Effect Size</h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div className="rounded-xl bg-slate-100 p-4">
                  <p className="text-sm text-slate-500">Absolute Lift</p>
                  <p className="mt-1 text-xl font-semibold">
                    {(result.effect.absolute_lift * 100).toFixed(2)} pp
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
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-xl font-semibold">Statistical Test</h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-3">
                <div className="rounded-xl bg-slate-100 p-4">
                  <p className="text-sm text-slate-500">Z Statistic</p>
                  <p className="mt-1 font-semibold">{result.test_statistic.z_stat}</p>
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

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-xl font-semibold">95% Confidence Interval</h2>
              <p className="mt-4 text-lg font-semibold">
                [{(result.confidence_interval_95.low * 100).toFixed(2)},{" "}
                {(result.confidence_interval_95.high * 100).toFixed(2)}] percentage points
              </p>
            </div>

            <div className="rounded-2xl border border-blue-200 bg-blue-50 p-6 shadow-sm">
              <h2 className="text-xl font-semibold text-blue-900">Interpretation</h2>
              <p className="mt-3 text-blue-900">{result.interpretation}</p>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}