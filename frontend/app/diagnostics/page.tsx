"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";

type DiagnosticsResponse = {
  treatment_counts: Record<string, number>;
  srm: {
    chi_square_stat: number;
    p_value: number;
    is_suspected: boolean;
  };
  missing_outcome_by_group: Record<string, number>;
  outcome_summary: {
    metric_name: string;
    by_group: Record<string, number>;
  };
  warnings: string[];
};

export default function DiagnosticsPage() {
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
  const [result, setResult] = useState<DiagnosticsResponse | null>(null);
  const [error, setError] = useState("");

  const handleRunDiagnostics = async () => {
    if (!fileId || !treatmentColumn || !outcomeColumn) {
      setError("Missing required parameters in URL.");
      return;
    }

    try {
      setLoading(true);
      setError("");
      setResult(null);

      const response = await fetch("http://127.0.0.1:8000/diagnostics", {
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
        throw new Error(errorData.detail || "Diagnostics failed.");
      }

      const data: DiagnosticsResponse = await response.json();
      setResult(data);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Something went wrong while running diagnostics.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const treatmentGroups = result ? Object.keys(result.treatment_counts) : [];
  const outcomeGroups = result ? Object.keys(result.outcome_summary.by_group) : [];
  const missingGroups = result ? Object.keys(result.missing_outcome_by_group) : [];

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-900">
      <div className="mx-auto max-w-5xl">
      <a
        href={`/map-columns?file_id=${encodeURIComponent(
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
        ← Back to mapping
      </a>

        <h1 className="mt-4 text-3xl font-bold">Experiment Diagnostics</h1>
        <p className="mt-2 text-slate-600">
          Review treatment balance, sample ratio mismatch, missing outcomes, and
          raw outcome summaries before running final analysis.
        </p>

        <div className="mt-4 rounded-lg bg-slate-100 p-4 text-sm text-slate-700">
          <p><span className="font-medium">File ID:</span> {fileId || "Not found"}</p>
          <p><span className="font-medium">Treatment Column:</span> {treatmentColumn || "Not found"}</p>
          <p><span className="font-medium">Outcome Column:</span> {outcomeColumn || "Not found"}</p>
        </div>

        <div className="mt-6">
          <button
            onClick={handleRunDiagnostics}
            disabled={loading}
            className="rounded-xl bg-slate-900 px-5 py-3 text-white transition hover:bg-slate-700 disabled:opacity-60"
          >
            {loading ? "Running Diagnostics..." : "Run Diagnostics"}
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
              <h2 className="text-xl font-semibold">Treatment Counts</h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                {treatmentGroups.map((group) => (
                  <div key={group} className="rounded-xl bg-slate-100 p-4">
                    <p className="text-sm text-slate-500">{group}</p>
                    <p className="mt-1 text-xl font-semibold">
                      {result.treatment_counts[group]}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-xl font-semibold">Sample Ratio Mismatch</h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-3">
                <div className="rounded-xl bg-slate-100 p-4">
                  <p className="text-sm text-slate-500">Chi-square Statistic</p>
                  <p className="mt-1 font-semibold">{result.srm.chi_square_stat}</p>
                </div>
                <div className="rounded-xl bg-slate-100 p-4">
                  <p className="text-sm text-slate-500">P-value</p>
                  <p className="mt-1 font-semibold">{result.srm.p_value}</p>
                </div>
                <div className="rounded-xl bg-slate-100 p-4">
                  <p className="text-sm text-slate-500">Status</p>
                  <p
                    className={`mt-1 font-semibold ${
                      result.srm.is_suspected ? "text-red-700" : "text-emerald-700"
                    }`}
                  >
                    {result.srm.is_suspected ? "Suspected SRM" : "No SRM Detected"}
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-xl font-semibold">Missing Outcome by Group</h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                {missingGroups.map((group) => (
                  <div key={group} className="rounded-xl bg-slate-100 p-4">
                    <p className="text-sm text-slate-500">{group}</p>
                    <p className="mt-1 text-xl font-semibold">
                      {result.missing_outcome_by_group[group]}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-xl font-semibold">Outcome Summary</h2>
              <p className="mt-2 text-sm text-slate-500">
                Metric: {result.outcome_summary.metric_name}
              </p>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                {outcomeGroups.map((group) => (
                  <div key={group} className="rounded-xl bg-slate-100 p-4">
                    <p className="text-sm text-slate-500">{group}</p>
                    <p className="mt-1 text-xl font-semibold">
                      {result.outcome_summary.by_group[group]}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {result.warnings.length > 0 ? (
              <div className="rounded-2xl border border-yellow-200 bg-yellow-50 p-6 shadow-sm">
                <h2 className="text-xl font-semibold text-yellow-800">Warnings</h2>
                <ul className="mt-3 list-disc pl-5 text-yellow-800">
                  {result.warnings.map((warning, index) => (
                    <li key={index}>{warning}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 shadow-sm">
                <h2 className="text-xl font-semibold text-emerald-800">Diagnostics Summary</h2>
                <p className="mt-2 text-emerald-700">
                  No major diagnostic warnings were detected for this dataset.
                </p>
              </div>
            )}
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <a
                    href={`/analysis?file_id=${encodeURIComponent(
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
                    Continue to Analysis
                </a>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}