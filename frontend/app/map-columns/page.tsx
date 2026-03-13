"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";

type ValidationResponse = {
  valid: boolean;
  errors: string[];
  warnings?: string[];
  summary?: {
    treatment_column: string;
    outcome_column: string;
    treatment_groups: string[];
    outcome_type: string;
    covariate_count: number;
    row_count: number;
  };
};

export default function MapColumnsPage() {
  const searchParams = useSearchParams();
  const fileId = searchParams.get("file_id") || "";

  const [treatmentColumn, setTreatmentColumn] = useState("treatment");
  const [outcomeColumn, setOutcomeColumn] = useState("converted");
  const [userIdColumn, setUserIdColumn] = useState("user_id");
  const [timestampColumn, setTimestampColumn] = useState("timestamp");
  const [covariates, setCovariates] = useState("device,country,prior_orders");
  const [prePeriodColumn, setPrePeriodColumn] = useState("pre_period_spend");

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ValidationResponse | null>(null);
  const [error, setError] = useState("");

  const handleValidate = async () => {
    if (!fileId) {
      setError("Missing file_id in URL.");
      return;
    }

    try {
      setLoading(true);
      setError("");
      setResult(null);

      const response = await fetch("http://127.0.0.1:8000/validate-columns", {
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
          covariate_columns: covariates
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean),
          pre_period_column: prePeriodColumn || null,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || "Validation failed.");
      }

      const data: ValidationResponse = await response.json();
      setResult(data);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Something went wrong during validation.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-900">
      <div className="mx-auto max-w-4xl">
        <a href="/upload" className="text-sm text-slate-500 hover:text-slate-900">
          ← Back to upload
        </a>

        <h1 className="mt-4 text-3xl font-bold">Map Dataset Columns</h1>
        <p className="mt-2 text-slate-600">
          Select which columns represent treatment, outcome, and optional covariates.
        </p>

        <div className="mt-3 rounded-lg bg-slate-100 p-3 text-sm text-slate-700">
          <span className="font-medium">File ID:</span> {fileId || "Not found"}
        </div>

        <div className="mt-8 grid gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div>
            <label className="mb-2 block text-sm font-medium">Treatment Column</label>
            <input
              value={treatmentColumn}
              onChange={(e) => setTreatmentColumn(e.target.value)}
              className="w-full rounded-lg border border-slate-300 p-3"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">Outcome Column</label>
            <input
              value={outcomeColumn}
              onChange={(e) => setOutcomeColumn(e.target.value)}
              className="w-full rounded-lg border border-slate-300 p-3"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">User ID Column</label>
            <input
              value={userIdColumn}
              onChange={(e) => setUserIdColumn(e.target.value)}
              className="w-full rounded-lg border border-slate-300 p-3"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">Timestamp Column</label>
            <input
              value={timestampColumn}
              onChange={(e) => setTimestampColumn(e.target.value)}
              className="w-full rounded-lg border border-slate-300 p-3"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">
              Covariate Columns (comma separated)
            </label>
            <input
              value={covariates}
              onChange={(e) => setCovariates(e.target.value)}
              className="w-full rounded-lg border border-slate-300 p-3"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">Pre-period Column</label>
            <input
              value={prePeriodColumn}
              onChange={(e) => setPrePeriodColumn(e.target.value)}
              className="w-full rounded-lg border border-slate-300 p-3"
            />
          </div>

          <button
            onClick={handleValidate}
            disabled={loading}
            className="rounded-xl bg-slate-900 px-5 py-3 text-white transition hover:bg-slate-700 disabled:opacity-60"
          >
            {loading ? "Validating..." : "Validate Column Mapping"}
          </button>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-red-700">
              {error}
            </div>
          )}
        </div>

        {result && (
          <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold">Validation Result</h2>

            <div className="mt-4">
              <p className={`font-medium ${result.valid ? "text-emerald-700" : "text-red-700"}`}>
                {result.valid ? "Valid mapping" : "Invalid mapping"}
              </p>
            </div>

            {result.summary && (
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div className="rounded-xl bg-slate-100 p-4">
                  <p className="text-sm text-slate-500">Treatment Groups</p>
                  <p className="mt-1 font-semibold">
                    {result.summary.treatment_groups.join(", ")}
                  </p>
                </div>
                <div className="rounded-xl bg-slate-100 p-4">
                  <p className="text-sm text-slate-500">Outcome Type</p>
                  <p className="mt-1 font-semibold">{result.summary.outcome_type}</p>
                </div>
                <div className="rounded-xl bg-slate-100 p-4">
                  <p className="text-sm text-slate-500">Covariate Count</p>
                  <p className="mt-1 font-semibold">{result.summary.covariate_count}</p>
                </div>
                <div className="rounded-xl bg-slate-100 p-4">
                  <p className="text-sm text-slate-500">Rows</p>
                  <p className="mt-1 font-semibold">{result.summary.row_count}</p>
                </div>
              </div>
            )}

            {result.warnings && result.warnings.length > 0 && (
              <div className="mt-6 rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-yellow-800">
                <p className="font-medium">Warnings</p>
                <ul className="mt-2 list-disc pl-5">
                  {result.warnings.map((warning, idx) => (
                    <li key={idx}>{warning}</li>
                  ))}
                </ul>
              </div>
            )}

            {result.errors && result.errors.length > 0 && (
              <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
                <p className="font-medium">Errors</p>
                <ul className="mt-2 list-disc pl-5">
                  {result.errors.map((err, idx) => (
                    <li key={idx}>{err}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}