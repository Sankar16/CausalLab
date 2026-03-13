from __future__ import annotations

from pathlib import Path
import pandas as pd
import numpy as np
from scipy.stats import chisquare


UPLOAD_DIR = Path(__file__).resolve().parents[2] / "uploads"


def compute_srm(
    treatment_counts: dict[str, int],
    expected_proportions: dict[str, float] | None = None,
) -> dict:
    groups = list(treatment_counts.keys())
    observed = np.array([treatment_counts[group] for group in groups], dtype=float)
    total = observed.sum()

    if expected_proportions:
        expected = np.array(
            [expected_proportions.get(group, 0.0) * total for group in groups],
            dtype=float,
        )
    else:
        expected = np.array([total / len(groups)] * len(groups), dtype=float)

    chi2_stat, p_value = chisquare(f_obs=observed, f_exp=expected)

    return {
        "chi_square_stat": round(float(chi2_stat), 4),
        "p_value": round(float(p_value), 6),
        "is_suspected": bool(p_value < 0.05),
        "expected_proportions": {
            group: (
                expected_proportions[group]
                if expected_proportions and group in expected_proportions
                else round(1 / len(groups), 4)
            )
            for group in groups
        },
    }


def run_experiment_diagnostics(payload: dict) -> dict:
    file_id = payload["file_id"]
    file_path = UPLOAD_DIR / file_id

    if not file_path.exists():
        raise FileNotFoundError("Uploaded file not found.")

    df = pd.read_csv(file_path)

    treatment_col = payload["treatment_column"]
    outcome_col = payload["outcome_column"]
    expected_proportions = payload.get("expected_proportions")

    if treatment_col not in df.columns or outcome_col not in df.columns:
        raise ValueError("Treatment or outcome column not found in dataset.")

    treatment_counts = df[treatment_col].value_counts(dropna=False).to_dict()
    non_null_treatment = df[treatment_col].dropna()

    unique_groups = non_null_treatment.unique().tolist()
    if len(unique_groups) != 2:
        raise ValueError("Diagnostics currently require exactly 2 treatment groups.")

    # Normalize expected proportions if provided
    normalized_expected_proportions = None
    if expected_proportions:
        expected_keys = set(expected_proportions.keys())
        actual_keys = set(str(group) for group in unique_groups)

        if expected_keys != actual_keys:
            raise ValueError(
                f"Expected proportions keys must match treatment groups exactly. "
                f"Found groups: {sorted(actual_keys)}"
            )

        total_expected = sum(float(v) for v in expected_proportions.values())
        if total_expected <= 0:
            raise ValueError("Expected proportions must sum to a positive value.")

        normalized_expected_proportions = {
            str(group): float(value) / total_expected
            for group, value in expected_proportions.items()
        }

    observed_counts = (
        non_null_treatment.astype(str).value_counts().to_dict()
    )

    srm_result = compute_srm(
        treatment_counts=observed_counts,
        expected_proportions=normalized_expected_proportions,
    )

    missing_outcome_by_group = (
        df.groupby(treatment_col)[outcome_col]
        .apply(lambda x: int(x.isna().sum()))
        .to_dict()
    )

    outcome_series = df[outcome_col]
    non_null_outcome = outcome_series.dropna()
    binary_values = set(non_null_outcome.unique().tolist()) if len(non_null_outcome) > 0 else set()
    is_binary = binary_values.issubset({0, 1, True, False})

    if is_binary:
        outcome_summary = (
            df.groupby(treatment_col)[outcome_col]
            .mean()
            .round(6)
            .to_dict()
        )
        outcome_metric_name = "mean_outcome_rate"
    else:
        outcome_summary = (
            df.groupby(treatment_col)[outcome_col]
            .mean()
            .round(6)
            .to_dict()
        )
        outcome_metric_name = "mean_outcome_value"

    warnings = []

    if srm_result["is_suspected"]:
        expected_text = ", ".join(
            [
                f"{group}: {round(prop * 100, 1)}%"
                for group, prop in srm_result["expected_proportions"].items()
            ]
        )
        warnings.append(
            "Sample Ratio Mismatch detected: observed treatment split differs significantly "
            f"from expected allocation ({expected_text})."
        )

    if any(v > 0 for v in missing_outcome_by_group.values()):
        warnings.append("Outcome column contains missing values in one or more groups.")

    return {
        "treatment_counts": treatment_counts,
        "srm": srm_result,
        "missing_outcome_by_group": missing_outcome_by_group,
        "outcome_summary": {
            "metric_name": outcome_metric_name,
            "by_group": outcome_summary,
        },
        "warnings": warnings,
    }