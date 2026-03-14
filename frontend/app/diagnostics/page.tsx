"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import InfoTooltip from "@/components/InfoTooltip";
import { API_BASE_URL } from "@/lib/api";
import SrmSplitChart from "@/components/charts/SrmSplitChart";
import GroupBarChart from "@/components/charts/GroupBarChart";
import MetricComparisonChart from "@/components/charts/MetricComparisonChart";

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

function DiagnosticsPageContent() {
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

  const [expectedMode, setExpectedMode] = useState<"equal" | "custom">("equal");
  const [expectedGroup1, setExpectedGroup1] = useState("50");

  const treatmentGroups = result ? Object.keys(result.treatment_counts) : [];
  const outcomeGroups = result ? Object.keys(result.outcome_summary.by_group) : [];
  const missingGroups = result ? Object.keys(result.missing_outcome_by_group) : [];

  const expectedGroup2 = useMemo(() => {
    const firstValue = Number(expectedGroup1);
    if (!Number.isFinite(firstValue)) return "";
    return String(100 - firstValue);
  }, [expectedGroup1]);

  const allMissingOutcomeZero =
    result &&
    Object.values(result.missing_outcome_by_group).every((value) => value === 0);

  const handleUseObservedSplit = () => {
    if (!result || treatmentGroups.length !== 2) return;

    const total = Object.values(result.treatment_counts).reduce((sum, value) => sum + value, 0);
    if (total === 0) return;

    const group1Observed = result.treatment_counts[treatmentGroups[0]];
    const group1Percent = ((group1Observed / total) * 100).toFixed(1);

    setExpectedMode("custom");
    setExpectedGroup1(group1Percent);
  };

  const handleRunDiagnostics = async () => {
    if (!fileId || !treatmentColumn || !outcomeColumn) {
      setError("Missing required parameters in URL.");
      return;
    }

    try {
      setLoading(true);
      setError("");
      setResult(null);

      let expectedProportions: Record<string, number> | null = null;

      if (expectedMode === "custom") {
        const firstValue = Number(expectedGroup1);
        const secondValue = 100 - firstValue;

        if (!Number.isFinite(firstValue)) {
          setError("Custom expected split value must be a valid number.");
          setLoading(false);
          return;
        }

        if (firstValue < 0 || firstValue > 100) {
          setError("Group 1 expected percentage must be between 0 and 100.");
          setLoading(false);
          return;
        }

        if (treatmentGroups.length !== 2) {
          setError(
            "Run diagnostics once first so CausalLab can detect the treatment groups for custom split."
          );
          setLoading(false);
          return;
        }

        expectedProportions = {
          [treatmentGroups[0]]: firstValue / 100,
          [treatmentGroups[1]]: secondValue / 100,
        };
      }

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
          expected_proportions: expectedProportions,
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

  const outcomeChartValueFormatter = (value: number) => {
    if (result?.outcome_summary.metric_name === "mean_outcome_rate") {
      return `${(value * 100).toFixed(2)}%`;
    }
    return value.toFixed(4);
  };

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-900">
      <div className="mx-auto max-w-6xl">
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
          Review treatment balance, sample ratio mismatch, missing outcomes, and raw outcome
          summaries before running final analysis.
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

        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-semibold">Expected Allocation for SRM</h2>
            <InfoTooltip text="SRM compares observed treatment counts against the intended allocation. Use equal split for standard 50/50 experiments, or set a custom split for uneven traffic allocation." />
          </div>

          <p className="mt-2 text-slate-600">
            Define the intended group split used for Sample Ratio Mismatch detection.
          </p>

          <div className="mt-4 flex flex-wrap gap-4">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="expectedMode"
                checked={expectedMode === "equal"}
                onChange={() => setExpectedMode("equal")}
              />
              <span>Equal split</span>
            </label>

            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="expectedMode"
                checked={expectedMode === "custom"}
                onChange={() => setExpectedMode("custom")}
              />
              <span>Custom split</span>
            </label>
          </div>

          {expectedMode === "custom" && (
            <div className="mt-4 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium">Group 1 Expected %</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={expectedGroup1}
                    onChange={(e) => setExpectedGroup1(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 p-3"
                  />
                  {treatmentGroups.length > 0 && (
                    <p className="mt-2 text-sm text-slate-500">Group 1: {treatmentGroups[0]}</p>
                  )}
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium">Group 2 Expected %</label>
                  <input
                    type="number"
                    value={expectedGroup2}
                    readOnly
                    className="w-full rounded-lg border border-slate-200 bg-slate-100 p-3 text-slate-600"
                  />
                  {treatmentGroups.length > 1 && (
                    <p className="mt-2 text-sm text-slate-500">Group 2: {treatmentGroups[1]}</p>
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={handleUseObservedSplit}
                disabled={!result || treatmentGroups.length !== 2}
                className="rounded-xl border border-slate-300 px-4 py-2 text-sm text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Use observed split
              </button>

              <p className="text-sm text-slate-500">
                Group 2 is automatically calculated as 100 - Group 1.
              </p>
            </div>
          )}
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
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-semibold">Treatment Counts</h2>
                <InfoTooltip text="Observed row counts for each experiment group." />
              </div>

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

              <div className="mt-6">
                <GroupBarChart
                  title=""
                  data={result.treatment_counts}
                  seriesLabel="Count"
                  fill="#0f172a"
                />
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-semibold">Sample Ratio Mismatch</h2>
                <InfoTooltip text="SRM checks whether the observed treatment split differs more than expected from the intended allocation." />
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-4">
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
                <div className="rounded-xl bg-slate-100 p-4">
                  <p className="text-sm text-slate-500">Expected Split</p>
                  <p className="mt-1 font-semibold">
                    {result.srm.expected_proportions
                      ? Object.entries(result.srm.expected_proportions)
                          .map(
                            ([group, proportion]) =>
                              `${group}: ${(proportion * 100).toFixed(1)}%`
                          )
                          .join(", ")
                      : "50/50 default"}
                  </p>
                </div>
              </div>

              <div className="mt-6">
                <SrmSplitChart
                  treatmentCounts={result.treatment_counts}
                  expectedProportions={result.srm.expected_proportions}
                />
              </div>

              <p className="mt-3 text-sm text-slate-500">
                This chart compares the observed treatment allocation against the expected split
                used for SRM detection.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-semibold">Missing Outcome by Group</h2>
                <InfoTooltip text="Count of rows where the selected outcome value is missing in each group." />
              </div>

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

              {allMissingOutcomeZero ? (
                <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800">
                  No missing outcome values were detected in any group.
                </div>
              ) : (
                <div className="mt-6">
                  <GroupBarChart
                    title=""
                    data={result.missing_outcome_by_group}
                    seriesLabel="Missing Rows"
                    fill="#b91c1c"
                  />
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-semibold">Outcome Summary</h2>
                <InfoTooltip text="Group-level average of the selected outcome. For binary outcomes this is the mean conversion rate; for continuous outcomes this is the mean value." />
              </div>

              <p className="mt-2 text-sm text-slate-500">
                Metric: {result.outcome_summary.metric_name}
              </p>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                {outcomeGroups.map((group) => (
                  <div key={group} className="rounded-xl bg-slate-100 p-4">
                    <p className="text-sm text-slate-500">{group}</p>
                    <p className="mt-1 text-xl font-semibold">
                      {outcomeChartValueFormatter(result.outcome_summary.by_group[group])}
                    </p>
                  </div>
                ))}
              </div>

              <div className="mt-6">
                <MetricComparisonChart
                  data={result.outcome_summary.by_group}
                  seriesLabel={
                    result.outcome_summary.metric_name === "mean_outcome_rate"
                      ? "Outcome Rate"
                      : "Outcome Value"
                  }
                  valueFormatter={outcomeChartValueFormatter}
                />
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
                <h2 className="text-xl font-semibold text-emerald-800">
                  Diagnostics Summary
                </h2>
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

export default function DiagnosticsPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-900">
          <div className="mx-auto max-w-5xl rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
            Loading diagnostics page...
          </div>
        </main>
      }
    >
      <DiagnosticsPageContent />
    </Suspense>
  );
}