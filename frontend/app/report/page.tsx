"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import TrustScoreCard from "@/components/TrustScoreCard";
import { API_BASE_URL } from "@/lib/api";

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
  const expectedMode =
    (searchParams.get("expected_mode") as "equal" | "custom" | null) || "equal";
  const expectedGroup1 = searchParams.get("expected_group_1") || "50";

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
  const [trust, setTrust] = useState<TrustScoreResponse | null>(null);
  const [llmSummary, setLlmSummary] = useState<LLMSummaryResponse | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState("");

  const buildExpectedProportions = (
    treatmentCounts?: Record<string, number>
  ): Record<string, number> | null => {
    if (expectedMode !== "custom") return null;
    if (!treatmentCounts) return null;

    const groups = Object.keys(treatmentCounts);
    if (groups.length !== 2) return null;

    const firstValue = Number(expectedGroup1);
    if (!Number.isFinite(firstValue)) return null;

    return {
      [groups[0]]: firstValue / 100,
      [groups[1]]: (100 - firstValue) / 100,
    };
  };

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

        const payloadBase = {
          file_id: fileId,
          treatment_column: treatmentColumn,
          outcome_column: outcomeColumn,
          user_id_column: userIdColumn || null,
          timestamp_column: timestampColumn || null,
          covariate_columns: covariateColumns,
          pre_period_column: prePeriodColumn || null,
        };

        const diagResInitial = await fetch(`${API_BASE_URL}/diagnostics`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...payloadBase,
            expected_proportions: null,
          }),
        });

        if (!diagResInitial.ok) {
          const err = await diagResInitial.json();
          throw new Error(err.detail || "Failed to fetch diagnostics.");
        }

        const initialDiagData: DiagnosticsResponse = await diagResInitial.json();
        const expectedProportions = buildExpectedProportions(initialDiagData.treatment_counts);

        const [diagRes, analysisRes, trustRes] = await Promise.all([
          fetch(`${API_BASE_URL}/diagnostics`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...payloadBase,
              expected_proportions: expectedProportions,
            }),
          }),
          fetch(`${API_BASE_URL}/analyze`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payloadBase),
          }),
          fetch(`${API_BASE_URL}/trust-score`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...payloadBase,
              expected_proportions: expectedProportions,
            }),
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

        if (trustRes.ok) {
          const trustData: TrustScoreResponse = await trustRes.json();
          setTrust(trustData);
        }
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
    expectedMode,
    expectedGroup1,
  ]);

  const handlePrint = () => {
    window.print();
  };

  const handleGenerateSummary = async () => {
    if (!diagnostics || !analysis) {
      setSummaryError("Diagnostics and analysis must be available first.");
      return;
    }

    try {
      setSummaryLoading(true);
      setSummaryError("");

      const response = await fetch(`${API_BASE_URL}/llm-summary`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          diagnostics,
          analysis,
          trust_score: trust,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || "Failed to generate executive summary.");
      }

      const data: LLMSummaryResponse = await response.json();
      setLlmSummary(data);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Something went wrong while generating the summary.";
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
            )}&covariates=${encodeURIComponent(
              covariateColumns.join(",")
            )}&expected_mode=${encodeURIComponent(
              expectedMode
            )}&expected_group_1=${encodeURIComponent(expectedGroup1)}`}
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
              {trust && <TrustScoreCard trust={trust} />}

              <section className="print:hidden">
                <h2 className="text-xl font-semibold">Executive Summary</h2>
                <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                  <button
                    onClick={handleGenerateSummary}
                    disabled={summaryLoading}
                    className="rounded-xl bg-slate-900 px-5 py-3 text-white transition hover:bg-slate-700 disabled:opacity-60"
                  >
                    {summaryLoading ? "Generating..." : "Generate Executive Summary"}
                  </button>

                  {summaryError && (
                    <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-red-700">
                      {summaryError}
                    </div>
                  )}

                  {llmSummary && (
                    <div className="mt-6 space-y-4">
                      <div className="rounded-xl bg-slate-100 p-4">
                        <h3 className="font-semibold">Executive Summary</h3>
                        <p className="mt-2 text-slate-700">{llmSummary.executive_summary}</p>
                      </div>
                      <div className="rounded-xl bg-slate-100 p-4">
                        <h3 className="font-semibold">Reliability Note</h3>
                        <p className="mt-2 text-slate-700">{llmSummary.reliability_note}</p>
                      </div>
                      <div className="rounded-xl bg-slate-100 p-4">
                        <h3 className="font-semibold">Recommendation</h3>
                        <p className="mt-2 text-slate-700">{llmSummary.recommendation}</p>
                      </div>
                    </div>
                  )}
                </div>
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
            Loading report page...
          </div>
        </main>
      }
    >
      <ReportPageContent />
    </Suspense>
  );
}