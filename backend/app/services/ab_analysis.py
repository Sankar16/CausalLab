from __future__ import annotations

from pathlib import Path
import math

import pandas as pd
from scipy.stats import norm, ttest_ind


UPLOAD_DIR = Path(__file__).resolve().parents[2] / "uploads"


def run_ab_analysis(payload: dict) -> dict:
    file_id = payload["file_id"]
    file_path = UPLOAD_DIR / file_id

    if not file_path.exists():
        raise FileNotFoundError("Uploaded file not found.")

    df = pd.read_csv(file_path)

    treatment_col = payload["treatment_column"]
    outcome_col = payload["outcome_column"]

    if treatment_col not in df.columns or outcome_col not in df.columns:
        raise ValueError("Treatment or outcome column not found in dataset.")

    working_df = df[[treatment_col, outcome_col]].dropna().copy()

    unique_groups = working_df[treatment_col].dropna().unique().tolist()
    if len(unique_groups) != 2:
        raise ValueError("A/B analysis requires exactly 2 treatment groups.")

    outcome_series = working_df[outcome_col]
    unique_outcomes = set(outcome_series.unique().tolist())
    is_binary = unique_outcomes.issubset({0, 1, True, False})

    if is_binary:
        return run_binary_ab_analysis_from_df(working_df, treatment_col, outcome_col)

    if pd.api.types.is_numeric_dtype(outcome_series):
        return run_continuous_ab_analysis_from_df(working_df, treatment_col, outcome_col)

    raise ValueError("Outcome column must be binary (0/1) or continuous numeric.")


def get_group_labels(working_df: pd.DataFrame, treatment_col: str) -> tuple[str, str]:
    group_counts = working_df[treatment_col].value_counts()
    sorted_groups = sorted(group_counts.index.tolist())

    control_group = "control" if "control" in group_counts.index else sorted_groups[0]
    treatment_group = "treatment" if "treatment" in group_counts.index else sorted_groups[1]

    return control_group, treatment_group


def run_binary_ab_analysis_from_df(
    working_df: pd.DataFrame, treatment_col: str, outcome_col: str
) -> dict:
    control_group, treatment_group = get_group_labels(working_df, treatment_col)

    control_df = working_df[working_df[treatment_col] == control_group]
    treatment_df = working_df[working_df[treatment_col] == treatment_group]

    n_control = len(control_df)
    n_treatment = len(treatment_df)

    x_control = int(control_df[outcome_col].sum())
    x_treatment = int(treatment_df[outcome_col].sum())

    p_control = x_control / n_control
    p_treatment = x_treatment / n_treatment

    absolute_lift = p_treatment - p_control
    relative_lift = (absolute_lift / p_control) if p_control != 0 else None

    pooled_p = (x_control + x_treatment) / (n_control + n_treatment)
    standard_error_pooled = math.sqrt(
        pooled_p * (1 - pooled_p) * (1 / n_control + 1 / n_treatment)
    )

    if standard_error_pooled == 0:
        z_stat = 0.0
        p_value = 1.0
    else:
        z_stat = absolute_lift / standard_error_pooled
        p_value = 2 * (1 - norm.cdf(abs(z_stat)))

    standard_error_unpooled = math.sqrt(
        (p_control * (1 - p_control) / n_control)
        + (p_treatment * (1 - p_treatment) / n_treatment)
    )

    ci_low = absolute_lift - 1.96 * standard_error_unpooled
    ci_high = absolute_lift + 1.96 * standard_error_unpooled

    interpretation = build_binary_interpretation(
        p_control=p_control,
        p_treatment=p_treatment,
        absolute_lift=absolute_lift,
        p_value=p_value,
        ci_low=ci_low,
        ci_high=ci_high,
        control_group=control_group,
        treatment_group=treatment_group,
    )

    return {
        "metric_type": "binary",
        "groups": {
          "control_label": control_group,
          "treatment_label": treatment_group,
        },
        "sample_sizes": {
            control_group: n_control,
            treatment_group: n_treatment,
        },
        "outcome_values": {
            control_group: x_control,
            treatment_group: x_treatment,
        },
        "outcome_rates": {
            control_group: round(p_control, 6),
            treatment_group: round(p_treatment, 6),
        },
        "effect": {
            "absolute_lift": round(absolute_lift, 6),
            "relative_lift": round(relative_lift, 6) if relative_lift is not None else None,
        },
        "test_statistic": {
            "test_name": "two_proportion_z_test",
            "stat": round(float(z_stat), 4),
            "p_value": round(float(p_value), 6),
        },
        "confidence_interval_95": {
            "low": round(float(ci_low), 6),
            "high": round(float(ci_high), 6),
        },
        "interpretation": interpretation,
    }


def run_continuous_ab_analysis_from_df(
    working_df: pd.DataFrame, treatment_col: str, outcome_col: str
) -> dict:
    control_group, treatment_group = get_group_labels(working_df, treatment_col)

    control_df = working_df[working_df[treatment_col] == control_group]
    treatment_df = working_df[working_df[treatment_col] == treatment_group]

    control_values = control_df[outcome_col].astype(float)
    treatment_values = treatment_df[outcome_col].astype(float)

    n_control = len(control_values)
    n_treatment = len(treatment_values)

    mean_control = float(control_values.mean())
    mean_treatment = float(treatment_values.mean())

    absolute_lift = mean_treatment - mean_control
    relative_lift = (absolute_lift / mean_control) if mean_control != 0 else None

    t_stat, p_value = ttest_ind(treatment_values, control_values, equal_var=False)

    var_control = float(control_values.var(ddof=1))
    var_treatment = float(treatment_values.var(ddof=1))
    standard_error = math.sqrt((var_control / n_control) + (var_treatment / n_treatment))

    ci_low = absolute_lift - 1.96 * standard_error
    ci_high = absolute_lift + 1.96 * standard_error

    interpretation = build_continuous_interpretation(
        mean_control=mean_control,
        mean_treatment=mean_treatment,
        absolute_lift=absolute_lift,
        p_value=float(p_value),
        ci_low=ci_low,
        ci_high=ci_high,
        control_group=control_group,
        treatment_group=treatment_group,
        outcome_col=outcome_col,
    )

    return {
        "metric_type": "continuous",
        "outcome_column": outcome_col,
        "groups": {
            "control_label": control_group,
            "treatment_label": treatment_group,
        },
        "sample_sizes": {
            control_group: n_control,
            treatment_group: n_treatment,
        },
        "outcome_means": {
            control_group: round(mean_control, 6),
            treatment_group: round(mean_treatment, 6),
        },
        "effect": {
            "absolute_lift": round(absolute_lift, 6),
            "relative_lift": round(relative_lift, 6) if relative_lift is not None else None,
        },
        "test_statistic": {
            "test_name": "welch_t_test",
            "stat": round(float(t_stat), 4),
            "p_value": round(float(p_value), 6),
        },
        "confidence_interval_95": {
            "low": round(float(ci_low), 6),
            "high": round(float(ci_high), 6),
        },
        "interpretation": interpretation,
    }


def build_binary_interpretation(
    *,
    p_control: float,
    p_treatment: float,
    absolute_lift: float,
    p_value: float,
    ci_low: float,
    ci_high: float,
    control_group: str,
    treatment_group: str,
) -> str:
    direction = "higher" if absolute_lift > 0 else "lower" if absolute_lift < 0 else "the same as"
    significant = p_value < 0.05

    control_pct = p_control * 100
    treatment_pct = p_treatment * 100
    lift_pct_points = absolute_lift * 100
    ci_low_pct = ci_low * 100
    ci_high_pct = ci_high * 100

    if significant:
        return (
            f"The {treatment_group} group has a {direction} conversion rate than the {control_group} group "
            f"({treatment_pct:.2f}% vs {control_pct:.2f}%). The estimated absolute lift is "
            f"{lift_pct_points:.2f} percentage points, and the result is statistically significant "
            f"(p = {p_value:.4f}). The 95% confidence interval for the lift is "
            f"[{ci_low_pct:.2f}, {ci_high_pct:.2f}] percentage points."
        )

    return (
        f"The {treatment_group} group has a {direction} conversion rate than the {control_group} group "
        f"({treatment_pct:.2f}% vs {control_pct:.2f}%). The estimated absolute lift is "
        f"{lift_pct_points:.2f} percentage points, but the result is not statistically significant "
        f"(p = {p_value:.4f}). The 95% confidence interval for the lift is "
        f"[{ci_low_pct:.2f}, {ci_high_pct:.2f}] percentage points."
    )


def build_continuous_interpretation(
    *,
    mean_control: float,
    mean_treatment: float,
    absolute_lift: float,
    p_value: float,
    ci_low: float,
    ci_high: float,
    control_group: str,
    treatment_group: str,
    outcome_col: str,
) -> str:
    direction = "higher" if absolute_lift > 0 else "lower" if absolute_lift < 0 else "the same as"
    significant = p_value < 0.05

    if significant:
        return (
            f"The {treatment_group} group has a {direction} average {outcome_col} than the {control_group} group "
            f"({mean_treatment:.2f} vs {mean_control:.2f}). The estimated absolute lift is "
            f"{absolute_lift:.2f}, and the result is statistically significant "
            f"(p = {p_value:.4f}). The 95% confidence interval for the lift is "
            f"[{ci_low:.2f}, {ci_high:.2f}]."
        )

    return (
        f"The {treatment_group} group has a {direction} average {outcome_col} than the {control_group} group "
        f"({mean_treatment:.2f} vs {mean_control:.2f}). The estimated absolute lift is "
        f"{absolute_lift:.2f}, but the result is not statistically significant "
        f"(p = {p_value:.4f}). The 95% confidence interval for the lift is "
        f"[{ci_low:.2f}, {ci_high:.2f}]."
    )