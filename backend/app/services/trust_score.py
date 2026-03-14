from __future__ import annotations

from typing import Any

from app.services.data_readiness import run_data_readiness_checks
from app.services.diagnostics import run_experiment_diagnostics
from app.services.ab_analysis import run_ab_analysis


def _ci_crosses_zero(low: float, high: float) -> bool:
    return low <= 0 <= high


def compute_trust_score(payload: dict[str, Any]) -> dict[str, Any]:
    readiness = run_data_readiness_checks(payload)
    diagnostics = run_experiment_diagnostics(payload)

    analysis = None
    analysis_error = None
    try:
        analysis = run_ab_analysis(payload)
    except Exception as exc:
        analysis_error = str(exc)

    score = 100
    deductions: list[dict[str, Any]] = []
    positive_signals: list[str] = []
    reasons: list[str] = []

    readiness_status = readiness.get("readiness_status")
    if readiness_status == "not_ready":
        score -= 40
        deductions.append(
            {"factor": "data_readiness", "points": 40, "reason": "Dataset is not ready for reliable analysis."}
        )
    elif readiness_status == "needs_review":
        score -= 15
        deductions.append(
            {"factor": "data_readiness", "points": 15, "reason": "Dataset needs review before full confidence."}
        )
    else:
        positive_signals.append("Data readiness checks did not find major structural blockers.")

    if diagnostics["srm"]["is_suspected"]:
        score -= 35
        deductions.append(
            {"factor": "sample_ratio_mismatch", "points": 35, "reason": "Sample Ratio Mismatch was detected."}
        )
    else:
        positive_signals.append("No Sample Ratio Mismatch was detected under the selected allocation.")

    total_missing_outcome = sum(diagnostics["missing_outcome_by_group"].values())
    if total_missing_outcome > 0:
        score -= 15
        deductions.append(
            {"factor": "missing_outcome", "points": 15, "reason": f"Outcome data has {total_missing_outcome} missing rows."}
        )
    else:
        positive_signals.append("No missing outcome data was detected across groups.")

    warning_count = len(diagnostics.get("warnings", []))
    if warning_count > 0:
        warning_penalty = min(20, warning_count * 10)
        score -= warning_penalty
        deductions.append(
            {
                "factor": "diagnostic_warnings",
                "points": warning_penalty,
                "reason": f"{warning_count} diagnostic warning(s) were generated.",
            }
        )

    if analysis is not None:
        p_value = analysis["test_statistic"]["p_value"]
        ci_low = analysis["confidence_interval_95"]["low"]
        ci_high = analysis["confidence_interval_95"]["high"]

        if p_value >= 0.05:
            score -= 10
            deductions.append(
                {"factor": "statistical_significance", "points": 10, "reason": "Result is not statistically significant."}
            )
        else:
            positive_signals.append("The treatment effect is statistically significant.")

        if _ci_crosses_zero(ci_low, ci_high):
            score -= 10
            deductions.append(
                {"factor": "confidence_interval", "points": 10, "reason": "Confidence interval crosses zero."}
            )
        else:
            positive_signals.append("Confidence interval does not cross zero.")
    else:
        score -= 10
        deductions.append(
            {"factor": "analysis_unavailable", "points": 10, "reason": "Analysis could not be computed for trust scoring."}
        )

    score = max(0, min(100, score))

    if score >= 80:
        decision = "Proceed"
        summary = "Experiment quality looks strong enough to support decision-making."
        recommended_next_step = "Proceed with reporting or rollout, while continuing normal monitoring."
    elif score >= 50:
        decision = "Proceed with Caution"
        summary = "The experiment is usable, but important issues should be acknowledged before acting."
        recommended_next_step = "Proceed carefully and explicitly communicate the identified risks to stakeholders."
    else:
        decision = "Do Not Trust Yet"
        summary = "The experiment currently has too many trust risks to support a confident decision."
        recommended_next_step = "Resolve data or diagnostic issues before using this result for decision-making."

    if deductions:
        reasons = [item["reason"] for item in deductions]
    else:
        reasons = ["No major trust deductions were triggered."]

    biggest_risk = deductions[0]["reason"] if deductions else None
    strongest_positive_signal = positive_signals[0] if positive_signals else None

    return {
        "trust_score": score,
        "decision": decision,
        "summary": summary,
        "reasons": reasons,
        "deductions": deductions,
        "positive_signals": positive_signals,
        "biggest_risk": biggest_risk,
        "strongest_positive_signal": strongest_positive_signal,
        "recommended_next_step": recommended_next_step,
        "inputs": {
            "readiness_status": readiness_status,
            "diagnostic_warning_count": warning_count,
            "srm_suspected": diagnostics["srm"]["is_suspected"],
            "missing_outcome_rows": total_missing_outcome,
            "analysis_available": analysis is not None,
            "analysis_error": analysis_error,
        },
    }