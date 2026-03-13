"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { API_BASE_URL } from "@/lib/api";

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

type LLMSummaryResponse = {
  executive_summary: string;
  reliability_note: string;
  recommendation: string;
};

function ReportPageContent() {
  const searchParams = useSearchParams();

  const fileId = searchParams.get("file_id") || "";
  const treatmentColumn = searchParams.get("treatment_column") || "";
  const outcomeColumn = searchParams.get("outcome_column") || "";
  const userIdColumn = searchParams.get("user_id_column") || "";
  const timestampColumn = searchParams.get("timestamp_column") || "";
  const prePeriodColumn = searchParams.get("pre_period_column") || "";
  const covariatesParam = searchParams.get("covariates") || "";

  const covariateColumns = useMemo(
    () =>
      covariatesParam
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    [covariatesParam]
  );

  const [diagnostics, setDiagnostics] = useState<DiagnosticsResponse | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [llmSummary, setLlmSummary] = useState<LLMSummaryResponse | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState("");

  useEffect(() => {
    const loadReportData = async () => {
      if (!fileId || !treatmentColumn || !outcomeColumn) {
        setError("Missing required parameters in URL.");
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError("");

        const payload = {
          file_id: fileId,
          treatment_column: treatmentColumn,
          outcome_column: outcomeColumn,
          user_id_column: userIdColumn || null,
          timestamp_column: timestampColumn || null,
          covariate_columns: covariateColumns,
          pre_period_column: prePeriodColumn || null,
        };

        const [diagRes, analysisRes] = await Promise.all([
          fetch(`${API_BASE_URL}/diagnostics`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          }),
          fetch(`${API_BASE_URL}/analyze`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          }),
        ]);

        if (!diagRes.ok) {
          const err = await diagRes.json();
          throw new Error(err.detail || "Failed to fetch diagnostics.");
        }

        if (!analysisRes.ok) {
          const err = await analysisRes.json();
          throw new Error(err.detail || "Failed to fetch analysis.");
        }

        const diagData: DiagnosticsResponse = await diagRes.json();
        const analysisData: AnalysisResponse = await analysisRes.json();

        setDiagnostics(diagData);
        setAnalysis(analysisData);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Something went wrong while loading the report.";
        setError(message);
      } finally {
        setLoading(false);
      }
    };

    loadReportData();
  }, [
    fileId,
    treatmentColumn,
    outcomeColumn,
    userIdColumn,
    timestampColumn,
    prePeriodColumn,
    covariatesParam,
    covariateColumns,
  ]);

  const handlePrint = () => {
    window.print();
  };

  const handleGenerateSummary = async () => {
    if (!diagnostics || !analysis) return;

    try {
      setSummaryLoading(true);
      setSummaryError("");
      setLlmSummary(null);

      const response = await fetch(`${API_BASE_URL}/llm-summary`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          metadata: {
            file_id: fileId,
            treatment_column: treatmentColumn,
            outcome_column: outcomeColumn,
            user_id_column: userIdColumn || null,
            timestamp_column: timestampColumn || null,
            pre_period_column: prePeriodColumn || null,
            covariates: covariateColumns,
          },
          diagnostics,
          analysis,
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || "Failed to generate executive summary.");
      }

      const data: LLMSummaryResponse = await response.json();
      setLlmSummary(data);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to generate executive summary.";
      setSummaryError(message);
    } finally {
      setSummaryLoading(false);
    }
  };

  const hasWarnings = diagnostics && diagnostics.warnings.length > 0;
  const hasSevereWarning = diagnostics?.srm.is_suspected ?? false;

  const controlLabel = analysis?.groups.control_label ?? "control";
  const treatmentLabel = analysis?.groups.treatment_label ?? "treatment";

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-900 print:bg-white print:px-0">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 print:hidden">
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
            className="text-sm text-slate-500 hover:text-slate-900"
          >
            ← Back to analysis
          </a>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm print:border-none print:shadow-none">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-slate-500">CausalLab Report</p>
              <h1 className="mt-2 text-3xl font-bold">Experiment Summary</h1>
              <p className="mt-2 text-slate-600">
                Consolidated diagnostics and A/B analysis report for the selected dataset.
              </p>
            </div>

            <button
              onClick={handlePrint}
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-700 print:hidden"
            >
              Print / Save as PDF
            </button>
          </div>

          {loading && (
            <div className="mt-8 rounded-lg border border-slate-200 bg-slate-50 p-4">
              Loading report...
            </div>
          )}

          {error && (
            <div className="mt-8 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
              {error}
            </div>
          )}

          {!loading && !error && diagnostics && analysis && (
            <div className="mt-8 space-y-8">
              <section>
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="text-xl font-semibold">Executive Summary</h2>
                  <button
                    onClick={handleGenerateSummary}
                    disabled={summaryLoading}
                    className="rounded-xl bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-700 disabled:opacity-60 print:hidden"
                  >
                    {summaryLoading ? "Generating..." : "Generate Executive Summary"}
                  </button>
                </div>

                {summaryError && (
                  <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
                    {summaryError}
                  </div>
                )}

                {llmSummary && (
                  <div className="mt-4 space-y-4">
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <p className="text-sm font-semibold text-slate-500">Executive Summary</p>
                      <p className="mt-2 text-slate-800">{llmSummary.executive_summary}</p>
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <p className="text-sm font-semibold text-slate-500">Reliability Note</p>
                      <p className="mt-2 text-slate-800">{llmSummary.reliability_note}</p>
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <p className="text-sm font-semibold text-slate-500">Recommendation</p>
                      <p className="mt-2 text-slate-800">{llmSummary.recommendation}</p>
                    </div>
                  </div>
                )}
              </section>

              <section>
                <h2 className="text-xl font-semibold">Experiment Setup</h2>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div className="rounded-xl bg-slate-100 p-4">
                    <p className="text-sm text-slate-500">File ID</p>
                    <p className="mt-1 break-all font-semibold">{fileId}</p>
                  </div>
                  <div className="rounded-xl bg-slate-100 p-4">
                    <p className="text-sm text-slate-500">Outcome Column</p>
                    <p className="mt-1 font-semibold">{outcomeColumn}</p>
                  </div>
                  <div className="rounded-xl bg-slate-100 p-4">
                    <p className="text-sm text-slate-500">Treatment Column</p>
                    <p className="mt-1 font-semibold">{treatmentColumn}</p>
                  </div>
                  <div className="rounded-xl bg-slate-100 p-4">
                    <p className="text-sm text-slate-500">Covariates</p>
                    <p className="mt-1 font-semibold">
                      {covariateColumns.length > 0 ? covariateColumns.join(", ") : "None selected"}
                    </p>
                  </div>
                </div>
              </section>

              <section>
                <h2 className="text-xl font-semibold">Trust Assessment</h2>
                {hasSevereWarning ? (
                  <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-red-800">
                    <p className="font-semibold">Interpret with Caution</p>
                    <p className="mt-2">
                      Diagnostics detected serious experiment-quality issues. Statistical significance
                      alone may not make this result trustworthy.
                    </p>
                    <ul className="mt-3 list-disc pl-5">
                      {diagnostics.warnings.map((warning, index) => (
                        <li key={index}>{warning}</li>
                      ))}
                    </ul>
                  </div>
                ) : hasWarnings ? (
                  <div className="mt-4 rounded-xl border border-yellow-200 bg-yellow-50 p-4 text-yellow-800">
                    <p className="font-semibold">Use Caution</p>
                    <p className="mt-2">
                      Diagnostics detected some issues that could affect confidence in the result.
                    </p>
                    <ul className="mt-3 list-disc pl-5">
                      {diagnostics.warnings.map((warning, index) => (
                        <li key={index}>{warning}</li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800">
                    <p className="font-semibold">Healthy Experiment Signals</p>
                    <p className="mt-2">
                      No major diagnostic warnings were detected before analysis.
                    </p>
                  </div>
                )}
              </section>

              <section>
                <h2 className="text-xl font-semibold">Diagnostics</h2>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div className="rounded-xl bg-slate-100 p-4">
                    <p className="text-sm text-slate-500">Treatment Counts</p>
                    <p className="mt-1 font-semibold">
                      {Object.entries(diagnostics.treatment_counts)
                        .map(([group, count]) => `${group}: ${count}`)
                        .join(" | ")}
                    </p>
                  </div>
                  <div className="rounded-xl bg-slate-100 p-4">
                    <p className="text-sm text-slate-500">SRM Status</p>
                    <p className="mt-1 font-semibold">
                      {diagnostics.srm.is_suspected
                        ? `Suspected (p=${diagnostics.srm.p_value})`
                        : `No SRM detected (p=${diagnostics.srm.p_value})`}
                    </p>
                  </div>
                  <div className="rounded-xl bg-slate-100 p-4">
                    <p className="text-sm text-slate-500">Missing Outcome by Group</p>
                    <p className="mt-1 font-semibold">
                      {Object.entries(diagnostics.missing_outcome_by_group)
                        .map(([group, count]) => `${group}: ${count}`)
                        .join(" | ")}
                    </p>
                  </div>
                  <div className="rounded-xl bg-slate-100 p-4">
                    <p className="text-sm text-slate-500">Outcome Summary</p>
                    <p className="mt-1 font-semibold">
                      {Object.entries(diagnostics.outcome_summary.by_group)
                        .map(([group, value]) => `${group}: ${value}`)
                        .join(" | ")}
                    </p>
                  </div>
                </div>
              </section>

              <section>
                <h2 className="text-xl font-semibold">Analysis Results</h2>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div className="rounded-xl bg-slate-100 p-4">
                    <p className="text-sm text-slate-500">
                      {analysis.metric_type === "binary" ? "Outcome Rates" : "Outcome Means"}
                    </p>
                    <p className="mt-1 font-semibold">
                      {analysis.metric_type === "binary"
                        ? `${controlLabel}: ${(
                            (analysis.outcome_rates?.[controlLabel] ?? 0) * 100
                          ).toFixed(2)}%, ${treatmentLabel}: ${(
                            (analysis.outcome_rates?.[treatmentLabel] ?? 0) * 100
                          ).toFixed(2)}%`
                        : `${controlLabel}: ${(analysis.outcome_means?.[controlLabel] ?? 0).toFixed(
                            2
                          )}, ${treatmentLabel}: ${(analysis.outcome_means?.[
                            treatmentLabel
                          ] ?? 0).toFixed(2)}`}
                    </p>
                  </div>
                  <div className="rounded-xl bg-slate-100 p-4">
                    <p className="text-sm text-slate-500">Absolute Lift</p>
                    <p className="mt-1 font-semibold">
                      {analysis.metric_type === "binary"
                        ? `${(analysis.effect.absolute_lift * 100).toFixed(2)} pp`
                        : analysis.effect.absolute_lift.toFixed(2)}
                    </p>
                  </div>
                  <div className="rounded-xl bg-slate-100 p-4">
                    <p className="text-sm text-slate-500">Relative Lift</p>
                    <p className="mt-1 font-semibold">
                      {analysis.effect.relative_lift !== null
                        ? `${(analysis.effect.relative_lift * 100).toFixed(2)}%`
                        : "N/A"}
                    </p>
                  </div>
                  <div className="rounded-xl bg-slate-100 p-4">
                    <p className="text-sm text-slate-500">P-value</p>
                    <p className="mt-1 font-semibold">{analysis.test_statistic.p_value}</p>
                  </div>
                  <div className="rounded-xl bg-slate-100 p-4 sm:col-span-2">
                    <p className="text-sm text-slate-500">95% Confidence Interval</p>
                    <p className="mt-1 font-semibold">
                      {analysis.metric_type === "binary"
                        ? `[${(analysis.confidence_interval_95.low * 100).toFixed(2)}, ${(
                            analysis.confidence_interval_95.high * 100
                          ).toFixed(2)}] percentage points`
                        : `[${analysis.confidence_interval_95.low.toFixed(2)}, ${analysis.confidence_interval_95.high.toFixed(
                            2
                          )}]`}
                    </p>
                  </div>
                </div>
              </section>

              <section>
                <h2 className="text-xl font-semibold">Interpretation</h2>
                <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-4 text-blue-900">
                  {analysis.interpretation}
                </div>
              </section>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

export default function ReportPage() {
    return (
      <Suspense
        fallback={
          <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-900">
            <div className="mx-auto max-w-4xl rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
              Loading report...
            </div>
          </main>
        }
      >
        <ReportPageContent />
      </Suspense>
    );
  }