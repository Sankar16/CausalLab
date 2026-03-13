"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { API_BASE_URL } from "@/lib/api";

type ProfileResponse = {
  file_id: string;
  profile: {
    row_count: number;
    column_count: number;
    columns: string[];
    dtypes: Record<string, string>;
    missing_counts: Record<string, number>;
    preview: Record<string, string | number | null>[];
  };
};

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

function MapColumnsPageContent() {
  const searchParams = useSearchParams();
  const fileId = searchParams.get("file_id") || "";

  const [profileData, setProfileData] = useState<ProfileResponse | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileError, setProfileError] = useState("");

  const [treatmentColumn, setTreatmentColumn] = useState("");
  const [outcomeColumn, setOutcomeColumn] = useState("");
  const [userIdColumn, setUserIdColumn] = useState("");
  const [timestampColumn, setTimestampColumn] = useState("");
  const [prePeriodColumn, setPrePeriodColumn] = useState("");
  const [covariateColumns, setCovariateColumns] = useState<string[]>([]);

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ValidationResponse | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchProfile = async () => {
      if (!fileId) {
        setProfileError("Missing file_id in URL.");
        setProfileLoading(false);
        return;
      }

      try {
        setProfileLoading(true);
        setProfileError("");

        const response = await fetch(`${API_BASE_URL}/profile/${fileId}`);

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.detail || "Failed to fetch profile.");
        }

        const data: ProfileResponse = await response.json();
        setProfileData(data);

        const columns = data.profile.columns;

        if (columns.includes("treatment")) setTreatmentColumn("treatment");
        if (columns.includes("converted")) setOutcomeColumn("converted");
        if (columns.includes("user_id")) setUserIdColumn("user_id");
        if (columns.includes("timestamp")) setTimestampColumn("timestamp");
        if (columns.includes("pre_period_spend")) setPrePeriodColumn("pre_period_spend");

        const defaultCovariates = ["device", "country", "prior_orders"].filter((col) =>
          columns.includes(col)
        );
        setCovariateColumns(defaultCovariates);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Something went wrong while fetching profile.";
        setProfileError(message);
      } finally {
        setProfileLoading(false);
      }
    };

    fetchProfile();
  }, [fileId]);

  const handleCovariateToggle = (column: string) => {
    setCovariateColumns((prev) =>
      prev.includes(column) ? prev.filter((col) => col !== column) : [...prev, column]
    );
  };

  const handleValidate = async () => {
    if (!fileId) {
      setError("Missing file_id in URL.");
      return;
    }

    if (!treatmentColumn || !outcomeColumn) {
      setError("Treatment and outcome columns are required.");
      return;
    }

    try {
      setLoading(true);
      setError("");
      setResult(null);

      const response = await fetch('${API_BASE_URL}/validate-columns', {
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

  const columns = profileData?.profile.columns ?? [];

  const renderSelect = (
    label: string,
    value: string,
    onChange: (value: string) => void,
    required = false
  ) => (
    <div>
      <label className="mb-2 block text-sm font-medium">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-slate-300 p-3"
      >
        <option value="">-- None --</option>
        {columns.map((column) => (
          <option key={column} value={column}>
            {column}
          </option>
        ))}
      </select>
    </div>
  );

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-900">
      <div className="mx-auto max-w-5xl">
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

        {profileLoading && (
          <div className="mt-6 rounded-lg border border-slate-200 bg-white p-4">
            Loading dataset profile...
          </div>
        )}

        {profileError && (
          <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
            {profileError}
          </div>
        )}

        {profileData && (
          <>
            <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-xl font-semibold">Dataset Columns</h2>
              <div className="mt-4 flex flex-wrap gap-2">
                {columns.map((column) => (
                  <span
                    key={column}
                    className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700"
                  >
                    {column}
                  </span>
                ))}
              </div>
            </div>

            <div className="mt-6 grid gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              {renderSelect("Treatment Column", treatmentColumn, setTreatmentColumn, true)}
              {renderSelect("Outcome Column", outcomeColumn, setOutcomeColumn, true)}
              {renderSelect("User ID Column", userIdColumn, setUserIdColumn)}
              {renderSelect("Timestamp Column", timestampColumn, setTimestampColumn)}
              {renderSelect("Pre-period Column", prePeriodColumn, setPrePeriodColumn)}

              <div>
                <label className="mb-2 block text-sm font-medium">Covariate Columns</label>
                <div className="grid gap-2 sm:grid-cols-2">
                  {columns.map((column) => (
                    <label
                      key={column}
                      className="flex items-center gap-2 rounded-lg border border-slate-200 p-3"
                    >
                      <input
                        type="checkbox"
                        checked={covariateColumns.includes(column)}
                        onChange={() => handleCovariateToggle(column)}
                      />
                      <span>{column}</span>
                    </label>
                  ))}
                </div>
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
          </>
        )}

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

            {result.valid && result.summary && (
              <div className="mt-6">
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
            )}
          </div>
        )}
      </div>
    </main>
  );
}

export default function MapColumnsPage() {
    return (
      <Suspense
        fallback={
          <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-900">
            <div className="mx-auto max-w-5xl rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
              Loading column mapping...
            </div>
          </main>
        }
      >
        <MapColumnsPageContent />
      </Suspense>
    );
  }