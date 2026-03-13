"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { API_BASE_URL } from "@/lib/api";
import InfoTooltip from "@/components/InfoTooltip";

type DataReadinessResponse = {
  summary: {
    row_count: number;
    duplicate_rows: number;
    missing_treatment_rows: number;
    missing_outcome_rows: number;
    treatment_group_count: number;
    outcome_detected_type: string;
  };
  checks: {
    name: string;
    status: "pass" | "warning" | "critical";
    message: string;
  }[];
  recommended_actions: string[];
  readiness_status: "ready" | "needs_review" | "not_ready";
};

function DataReadinessPageContent() {
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
  const [result, setResult] = useState<DataReadinessResponse | null>(null);
  const [error, setError] = useState("");

  const handleRunReadinessCheck = async () => {
    if (!fileId || !treatmentColumn || !outcomeColumn) {
      setError("Missing required parameters in URL.");
      return;
    }

    try {
      setLoading(true);
      setError("");
      setResult(null);

      const response = await fetch(`${API_BASE_URL}/data-readiness`, {
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

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || "Data readiness check failed.");
      }

      const data: DataReadinessResponse = await response.json();
      setResult(data);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Something went wrong during data readiness check.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const readinessBadge = () => {
    if (!result) return null;

    if (result.readiness_status === "ready") {
      return (
        <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-emerald-800">Ready for Diagnostics</h2>
          <p className="mt-2 text-emerald-700">
            No major structural issues were detected. You can proceed with confidence.
          </p>
        </div>
      );
    }

    if (result.readiness_status === "needs_review") {
      return (
        <div className="mt-6 rounded-2xl border border-yellow-200 bg-yellow-50 p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-yellow-800">Needs Review</h2>
          <p className="mt-2 text-yellow-700">
            The dataset is usable, but some issues should be reviewed before analysis.
          </p>
        </div>
      );
    }

    return (
      <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-red-800">Not Ready</h2>
        <p className="mt-2 text-red-700">
          Critical issues were detected. Review the dataset before continuing.
        </p>
      </div>
    );
  };

  const checkStatusClasses = (status: "pass" | "warning" | "critical") => {
    if (status === "pass") {
      return "border-emerald-200 bg-emerald-50 text-emerald-800";
    }
    if (status === "warning") {
      return "border-yellow-200 bg-yellow-50 text-yellow-800";
    }
    return "border-red-200 bg-red-50 text-red-800";
  };

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

        <h1 className="mt-4 text-3xl font-bold">Data Readiness</h1>
        <p className="mt-2 text-slate-600">
          Check whether the dataset is suitable for trustworthy experiment diagnostics and analysis.
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

        <div className="mt-6">
          <button
            onClick={handleRunReadinessCheck}
            disabled={loading}
            className="rounded-xl bg-slate-900 px-5 py-3 text-white transition hover:bg-slate-700 disabled:opacity-60"
          >
            {loading ? "Running Readiness Check..." : "Run Data Readiness Check"}
          </button>
        </div>

        {error && (
          <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
            {error}
          </div>
        )}

        {result && (
          <div className="mt-8 space-y-6">
            {readinessBadge()}

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-semibold">Summary</h2>
                <InfoTooltip text="High-level structural summary of the uploaded dataset based on selected treatment and outcome columns." />
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div className="rounded-xl bg-slate-100 p-4">
                  <p className="text-sm text-slate-500">Rows</p>
                  <p className="mt-1 font-semibold">{result.summary.row_count}</p>
                </div>
                <div className="rounded-xl bg-slate-100 p-4">
                  <p className="text-sm text-slate-500">Duplicate Rows</p>
                  <p className="mt-1 font-semibold">{result.summary.duplicate_rows}</p>
                </div>
                <div className="rounded-xl bg-slate-100 p-4">
                  <p className="text-sm text-slate-500">Missing Treatment Rows</p>
                  <p className="mt-1 font-semibold">
                    {result.summary.missing_treatment_rows}
                  </p>
                </div>
                <div className="rounded-xl bg-slate-100 p-4">
                  <p className="text-sm text-slate-500">Missing Outcome Rows</p>
                  <p className="mt-1 font-semibold">{result.summary.missing_outcome_rows}</p>
                </div>
                <div className="rounded-xl bg-slate-100 p-4">
                  <p className="text-sm text-slate-500">Treatment Group Count</p>
                  <p className="mt-1 font-semibold">
                    {result.summary.treatment_group_count}
                  </p>
                </div>
                <div className="rounded-xl bg-slate-100 p-4">
                  <p className="text-sm text-slate-500">Detected Outcome Type</p>
                  <p className="mt-1 font-semibold">
                    {result.summary.outcome_detected_type}
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-semibold">Check Results</h2>
                <InfoTooltip text="Each readiness check is marked as pass, warning, or critical based on whether the issue could affect analysis quality." />
              </div>

              <div className="mt-4 space-y-4">
                {result.checks.map((check) => (
                  <div
                    key={check.name}
                    className={`rounded-xl border p-4 ${checkStatusClasses(check.status)}`}
                  >
                    <p className="text-sm font-semibold uppercase tracking-wide">
                      {check.status}
                    </p>
                    <p className="mt-1 font-medium">{check.name}</p>
                    <p className="mt-2">{check.message}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-semibold">Recommended Actions</h2>
                <InfoTooltip text="These are suggested cleanup or review steps before continuing to diagnostics and analysis." />
              </div>

              {result.recommended_actions.length > 0 ? (
                <ul className="mt-4 list-disc pl-5 text-slate-700">
                  {result.recommended_actions.map((action, idx) => (
                    <li key={idx}>{action}</li>
                  ))}
                </ul>
              ) : (
                <p className="mt-4 text-slate-600">
                  No specific cleanup actions were recommended.
                </p>
              )}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
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
                className="inline-block rounded-xl bg-emerald-700 px-5 py-3 text-white transition hover:bg-emerald-600"
              >
                Continue to Diagnostics
              </a>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

export default function DataReadinessPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-900">
          <div className="mx-auto max-w-5xl rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
            Loading data readiness page...
          </div>
        </main>
      }
    >
      <DataReadinessPageContent />
    </Suspense>
  );
}