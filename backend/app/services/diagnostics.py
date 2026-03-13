from __future__ import annotations

from pathlib import Path
import pandas as pd
from scipy.stats import chisquare


UPLOAD_DIR = Path(__file__).resolve().parents[2] / "uploads"


def run_experiment_diagnostics(payload: dict) -> dict:
    file_id = payload["file_id"]
    file_path = UPLOAD_DIR / file_id

    if not file_path.exists():
        raise FileNotFoundError("Uploaded file not found.")

    df = pd.read_csv(file_path)

    treatment_col = payload["treatment_column"]
    outcome_col = payload["outcome_column"]

    if treatment_col not in df.columns or outcome_col not in df.columns:
        raise ValueError("Treatment or outcome column not found in dataset.")

    treatment_counts = df[treatment_col].value_counts(dropna=False).to_dict()
    non_null_treatment = df[treatment_col].dropna()

    unique_groups = non_null_treatment.unique().tolist()
    if len(unique_groups) != 2:
        raise ValueError("Diagnostics currently require exactly 2 treatment groups.")

    observed = non_null_treatment.value_counts().sort_index()
    expected = [observed.sum() / 2, observed.sum() / 2]
    srm_stat, srm_p_value = chisquare(f_obs=observed.values, f_exp=expected)

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

    if srm_p_value < 0.05:
        warnings.append(
            "Sample Ratio Mismatch detected: observed treatment split differs significantly from expected 50/50 split."
        )

    if any(v > 0 for v in missing_outcome_by_group.values()):
        warnings.append("Outcome column contains missing values in one or more groups.")

    return {
        "treatment_counts": treatment_counts,
        "srm": {
            "chi_square_stat": round(float(srm_stat), 4),
            "p_value": round(float(srm_p_value), 6),
            "is_suspected": bool(srm_p_value < 0.05),
        },
        "missing_outcome_by_group": missing_outcome_by_group,
        "outcome_summary": {
            "metric_name": outcome_metric_name,
            "by_group": outcome_summary,
        },
        "warnings": warnings,
    }