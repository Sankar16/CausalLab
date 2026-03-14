"use client";

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

export default function TrustScoreCard({ trust }: { trust: TrustScoreResponse }) {
  const badgeClasses =
    trust.decision === "Proceed"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : trust.decision === "Proceed with Caution"
      ? "border-yellow-200 bg-yellow-50 text-yellow-800"
      : "border-red-200 bg-red-50 text-red-800";

  const scoreClasses =
    trust.trust_score >= 80
      ? "text-emerald-700"
      : trust.trust_score >= 50
      ? "text-yellow-700"
      : "text-red-700";

  return (
    <div className={`rounded-2xl border p-6 shadow-sm ${badgeClasses}`}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-2xl font-bold">Experiment Trust Score</h2>
          <p className="mt-2">{trust.summary}</p>
        </div>

        <div className="rounded-2xl bg-white/70 px-6 py-4 text-center shadow-sm">
          <p className="text-sm font-medium">Trust Score</p>
          <p className={`mt-1 text-3xl font-bold ${scoreClasses}`}>{trust.trust_score}/100</p>
          <p className="mt-2 text-sm font-semibold">{trust.decision}</p>
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl bg-white/60 p-4">
          <p className="text-sm font-medium">Biggest Risk</p>
          <p className="mt-2">{trust.biggest_risk ?? "No major risk identified."}</p>
        </div>

        <div className="rounded-xl bg-white/60 p-4">
          <p className="text-sm font-medium">Strongest Positive Signal</p>
          <p className="mt-2">
            {trust.strongest_positive_signal ?? "No strong positive signal identified."}
          </p>
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl bg-white/60 p-4">
          <p className="text-sm font-medium">Why this score?</p>
          <ul className="mt-2 list-disc pl-5">
            {trust.reasons.map((reason, idx) => (
              <li key={idx}>{reason}</li>
            ))}
          </ul>
        </div>

        <div className="rounded-xl bg-white/60 p-4">
          <p className="text-sm font-medium">Recommended Next Step</p>
          <p className="mt-2">{trust.recommended_next_step}</p>
        </div>
      </div>
    </div>
  );
}