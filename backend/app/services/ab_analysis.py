from __future__ import annotations

from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
import statsmodels.api as sm
from scipy.stats import norm

UPLOAD_DIR = Path(__file__).resolve().parents[2] / "uploads"


def _load_csv(file_id: str) -> pd.DataFrame:
    file_path = UPLOAD_DIR / file_id
    if not file_path.exists():
        raise FileNotFoundError("Uploaded file not found.")
    return pd.read_csv(file_path)


def _normalize_binary_series(series: pd.Series) -> pd.Series:
    mapping = {
        "1": 1,
        "0": 0,
        "true": 1,
        "false": 0,
        "yes": 1,
        "no": 0,
        "True": 1,
        "False": 0,
        "Yes": 1,
        "No": 0,
        1: 1,
        0: 0,
        True: 1,
        False: 0,
    }

    def convert(value: Any) -> float | None:
        if pd.isna(value):
            return np.nan
        if value in mapping:
            return float(mapping[value])
        text = str(value).strip()
        if text in mapping:
            return float(mapping[text])
        lowered = text.lower()
        if lowered in mapping:
            return float(mapping[lowered])
        return np.nan

    return series.apply(convert)


def _detect_metric_type(series: pd.Series) -> str:
    non_null = series.dropna()
    if len(non_null) == 0:
        raise ValueError("Outcome column has no usable values.")

    normalized_binary = _normalize_binary_series(non_null)
    if normalized_binary.notna().mean() >= 0.95:
        binary_values = set(normalized_binary.dropna().unique().tolist())
        if binary_values.issubset({0.0, 1.0}):
            return "binary"

    numeric = pd.to_numeric(non_null, errors="coerce")
    if numeric.notna().mean() >= 0.95:
        return "continuous"

    raise ValueError(
        "Outcome column must be binary (0/1-like) or continuous numeric for analysis."
    )


def _two_proportion_result(
    control_success: int,
    control_n: int,
    treatment_success: int,
    treatment_n: int,
) -> dict[str, Any]:
    p_control = control_success / control_n
    p_treatment = treatment_success / treatment_n

    absolute_lift = p_treatment - p_control
    relative_lift = None if p_control == 0 else absolute_lift / p_control

    pooled = (control_success + treatment_success) / (control_n + treatment_n)
    se_pooled = np.sqrt(pooled * (1 - pooled) * ((1 / control_n) + (1 / treatment_n)))
    z_stat = 0.0 if se_pooled == 0 else absolute_lift / se_pooled
    p_value = 2 * (1 - norm.cdf(abs(z_stat)))

    se_unpooled = np.sqrt(
        (p_control * (1 - p_control) / control_n)
        + (p_treatment * (1 - p_treatment) / treatment_n)
    )
    ci_low = absolute_lift - 1.96 * se_unpooled
    ci_high = absolute_lift + 1.96 * se_unpooled

    return {
        "absolute_lift": float(absolute_lift),
        "relative_lift": None if relative_lift is None else float(relative_lift),
        "test_name": "two_proportion_z_test",
        "stat": float(z_stat),
        "p_value": float(p_value),
        "ci_low": float(ci_low),
        "ci_high": float(ci_high),
    }


def _continuous_result(control_values: pd.Series, treatment_values: pd.Series) -> dict[str, Any]:
    control_values = pd.to_numeric(control_values, errors="coerce").dropna()
    treatment_values = pd.to_numeric(treatment_values, errors="coerce").dropna()

    if len(control_values) == 0 or len(treatment_values) == 0:
        raise ValueError("Continuous outcome analysis requires values in both groups.")

    control_mean = float(control_values.mean())
    treatment_mean = float(treatment_values.mean())

    absolute_lift = treatment_mean - control_mean
    relative_lift = None if control_mean == 0 else absolute_lift / control_mean

    n0 = len(control_values)
    n1 = len(treatment_values)
    v0 = float(control_values.var(ddof=1)) if n0 > 1 else 0.0
    v1 = float(treatment_values.var(ddof=1)) if n1 > 1 else 0.0

    se = np.sqrt((v0 / n0) + (v1 / n1))
    t_stat = 0.0 if se == 0 else absolute_lift / se
    p_value = 2 * (1 - norm.cdf(abs(t_stat)))
    ci_low = absolute_lift - 1.96 * se
    ci_high = absolute_lift + 1.96 * se

    return {
        "absolute_lift": float(absolute_lift),
        "relative_lift": None if relative_lift is None else float(relative_lift),
        "test_name": "difference_in_means_z_approx",
        "stat": float(t_stat),
        "p_value": float(p_value),
        "ci_low": float(ci_low),
        "ci_high": float(ci_high),
    }


def _build_treatment_indicator(df: pd.DataFrame, treatment_col: str) -> tuple[pd.DataFrame, str, str]:
    non_null_groups = df[treatment_col].dropna().astype(str).unique().tolist()
    if len(non_null_groups) != 2:
        raise ValueError("Analysis currently requires exactly 2 treatment groups.")

    groups = sorted(non_null_groups)
    control_label, treatment_label = groups[0], groups[1]

    working = df.copy()
    working[treatment_col] = working[treatment_col].astype(str)
    working["_treatment_indicator"] = (working[treatment_col] == treatment_label).astype(int)

    return working, control_label, treatment_label


def _prepare_covariates(
    df: pd.DataFrame,
    covariate_columns: list[str],
) -> tuple[pd.DataFrame, list[str], list[str], list[str]]:
    if not covariate_columns:
        return pd.DataFrame(index=df.index), [], [], []

    parts: list[pd.DataFrame] = []
    used_columns: list[str] = []
    dropped_columns: list[str] = []
    warnings: list[str] = []

    for col in covariate_columns:
        if col not in df.columns:
            dropped_columns.append(col)
            warnings.append(f"{col}: not found in dataset.")
            continue

        if col == "_treatment_indicator":
            dropped_columns.append(col)
            warnings.append(f"{col}: cannot be used because it duplicates treatment encoding.")
            continue

        series = df[col]

        if pd.api.types.is_numeric_dtype(series):
            numeric = pd.to_numeric(series, errors="coerce")
            if numeric.notna().sum() < 20:
                dropped_columns.append(col)
                warnings.append(f"{col}: dropped because too few usable numeric values were available.")
                continue

            if numeric.nunique(dropna=True) <= 1:
                dropped_columns.append(col)
                warnings.append(f"{col}: dropped because it has no meaningful variation.")
                continue

            parts.append(numeric.to_frame(col))
            used_columns.append(col)
            continue

        as_str = series.astype("string")
        non_null = as_str.dropna()

        if len(non_null) < 20:
            dropped_columns.append(col)
            warnings.append(f"{col}: dropped because too few usable categorical values were available.")
            continue

        n_unique = int(non_null.nunique())
        if n_unique <= 1:
            dropped_columns.append(col)
            warnings.append(f"{col}: dropped because it has no meaningful variation.")
            continue

        if n_unique > 20:
            dropped_columns.append(col)
            warnings.append(
                f"{col}: dropped because it has too many category levels ({n_unique}) for safe v1 adjustment."
            )
            continue

        vc = non_null.value_counts()
        rare_levels = int((vc < 10).sum())
        if rare_levels > 0:
            warnings.append(f"{col}: contains {rare_levels} sparse category level(s); model stability may be reduced.")

        dummies = pd.get_dummies(as_str, prefix=col, dummy_na=False, drop_first=True)

        if dummies.shape[1] == 0:
            dropped_columns.append(col)
            warnings.append(f"{col}: dropped because dummy encoding produced no usable columns.")
            continue

        dummies = dummies.loc[:, dummies.nunique(dropna=False) > 1]
        if dummies.shape[1] == 0:
            dropped_columns.append(col)
            warnings.append(f"{col}: dropped because encoded columns had no usable variation.")
            continue

        parts.append(dummies)
        used_columns.append(col)

    if not parts:
        return pd.DataFrame(index=df.index), [], dropped_columns, warnings

    X_cov = pd.concat(parts, axis=1)
    X_cov = X_cov.loc[:, X_cov.nunique(dropna=False) > 1]

    return X_cov, used_columns, dropped_columns, warnings


def _sanitize_design_matrix(
    X: pd.DataFrame,
    y: pd.Series,
) -> tuple[pd.DataFrame, pd.Series, list[str], list[str]]:
    dropped_columns: list[str] = []
    warnings: list[str] = []

    X_clean = X.copy()

    for col in X_clean.columns:
        if X_clean[col].dtype == bool:
            X_clean[col] = X_clean[col].astype(int)

    for col in X_clean.columns:
        X_clean[col] = pd.to_numeric(X_clean[col], errors="coerce")

    all_null_cols = [col for col in X_clean.columns if X_clean[col].isna().all()]
    if all_null_cols:
        X_clean = X_clean.drop(columns=all_null_cols)
        dropped_columns.extend(all_null_cols)
        warnings.append(
            f"Dropped non-numeric or unusable covariate columns after coercion: {', '.join(all_null_cols)}."
        )

    valid_rows = ~(X_clean.isna().any(axis=1) | y.isna())
    dropped_rows = int((~valid_rows).sum())
    if dropped_rows > 0:
        warnings.append(
            f"Dropped {dropped_rows} row(s) from adjusted analysis after numeric coercion."
        )

    X_clean = X_clean.loc[valid_rows].copy()
    y_clean = y.loc[valid_rows].copy()

    if not X_clean.empty:
        constant_cols = [col for col in X_clean.columns if X_clean[col].nunique(dropna=False) <= 1]
        if constant_cols:
            X_clean = X_clean.drop(columns=constant_cols)
            dropped_columns.extend(constant_cols)
            warnings.append(
                f"Dropped constant covariate columns before model fit: {', '.join(constant_cols)}."
            )

    X_clean = X_clean.astype(float)

    return X_clean, y_clean, dropped_columns, warnings


def _build_unavailable_adjusted_result(
    reason: str,
    used_covariates: list[str] | None = None,
    dropped_covariates: list[str] | None = None,
    warnings: list[str] | None = None,
) -> dict[str, Any]:
    return {
        "status": "unavailable",
        "method": None,
        "covariates_used": used_covariates or [],
        "dropped_covariates": dropped_covariates or [],
        "warnings": warnings or [],
        "unavailable_reason": reason,
        "coefficient": None,
        "effect": {
            "absolute_lift": None,
            "relative_lift": None,
        },
        "test_statistic": {
            "test_name": None,
            "stat": None,
            "p_value": None,
        },
        "confidence_interval_95": {
            "low": None,
            "high": None,
        },
        "note": None,
    }


def _adjusted_binary_result(
    df: pd.DataFrame,
    outcome_col: str,
    covariate_columns: list[str],
) -> dict[str, Any]:
    working = df.copy()
    working[outcome_col] = _normalize_binary_series(working[outcome_col])

    X_cov, used_covariates, dropped_covariates, prep_warnings = _prepare_covariates(
        working, covariate_columns
    )

    if not used_covariates or X_cov.shape[1] == 0:
        return _build_unavailable_adjusted_result(
            reason="No eligible covariates remained after preprocessing.",
            used_covariates=[],
            dropped_covariates=dropped_covariates,
            warnings=prep_warnings,
        )

    model_df = pd.concat([working[[outcome_col, "_treatment_indicator"]], X_cov], axis=1).dropna()

    if model_df.empty:
        return _build_unavailable_adjusted_result(
            reason="No rows remained after combining the outcome with usable covariates.",
            used_covariates=used_covariates,
            dropped_covariates=dropped_covariates,
            warnings=prep_warnings,
        )

    y = model_df[outcome_col].astype(float)
    X = model_df.drop(columns=[outcome_col])
    X = sm.add_constant(X, has_constant="add")

    X, y, sanitize_dropped, sanitize_warnings = _sanitize_design_matrix(X, y)
    dropped_covariates = dropped_covariates + sanitize_dropped
    all_warnings = prep_warnings + sanitize_warnings

    if X.empty or y.empty:
        return _build_unavailable_adjusted_result(
            reason="No usable rows remained after converting adjusted-analysis inputs to numeric.",
            used_covariates=used_covariates,
            dropped_covariates=dropped_covariates,
            warnings=all_warnings,
        )

    if X.shape[1] <= 1:
        return _build_unavailable_adjusted_result(
            reason="No usable covariate columns remained after numeric coercion.",
            used_covariates=[],
            dropped_covariates=dropped_covariates,
            warnings=all_warnings,
        )

    try:
        model = sm.Logit(y, X).fit(disp=False, maxiter=200)
    except Exception as exc:
        return _build_unavailable_adjusted_result(
            reason=f"Adjusted logistic model did not converge safely: {str(exc)}",
            used_covariates=used_covariates,
            dropped_covariates=dropped_covariates,
            warnings=all_warnings,
        )

    treatment_coef = float(model.params["_treatment_indicator"])
    treatment_p = float(model.pvalues["_treatment_indicator"])
    treatment_ci = model.conf_int().loc["_treatment_indicator"]

    X_control = X.copy()
    X_control["_treatment_indicator"] = 0
    X_treatment = X.copy()
    X_treatment["_treatment_indicator"] = 1

    control_pred = model.predict(X_control)
    treatment_pred = model.predict(X_treatment)

    adjusted_control_rate = float(np.mean(control_pred))
    adjusted_treatment_rate = float(np.mean(treatment_pred))
    adjusted_absolute_lift = adjusted_treatment_rate - adjusted_control_rate
    adjusted_relative_lift = (
        None if adjusted_control_rate == 0 else adjusted_absolute_lift / adjusted_control_rate
    )

    return {
        "status": "available",
        "method": "logistic_regression",
        "covariates_used": used_covariates,
        "dropped_covariates": dropped_covariates,
        "warnings": all_warnings,
        "unavailable_reason": None,
        "coefficient": treatment_coef,
        "effect": {
            "absolute_lift": float(adjusted_absolute_lift),
            "relative_lift": None if adjusted_relative_lift is None else float(adjusted_relative_lift),
            "adjusted_control_rate": adjusted_control_rate,
            "adjusted_treatment_rate": adjusted_treatment_rate,
        },
        "test_statistic": {
            "test_name": "logistic_regression_treatment_coefficient",
            "stat": treatment_coef,
            "p_value": treatment_p,
        },
        "confidence_interval_95": {
            "low": float(treatment_ci[0]),
            "high": float(treatment_ci[1]),
        },
        "note": (
            "Adjusted binary analysis uses logistic regression. The adjusted lift is shown on the "
            "probability scale using model-predicted rates, while the confidence interval is for "
            "the treatment coefficient on the log-odds scale."
        ),
    }


def _adjusted_continuous_result(
    df: pd.DataFrame,
    outcome_col: str,
    covariate_columns: list[str],
) -> dict[str, Any]:
    working = df.copy()
    working[outcome_col] = pd.to_numeric(working[outcome_col], errors="coerce")

    X_cov, used_covariates, dropped_covariates, prep_warnings = _prepare_covariates(
        working, covariate_columns
    )

    if not used_covariates or X_cov.shape[1] == 0:
        return _build_unavailable_adjusted_result(
            reason="No eligible covariates remained after preprocessing.",
            used_covariates=[],
            dropped_covariates=dropped_covariates,
            warnings=prep_warnings,
        )

    model_df = pd.concat([working[[outcome_col, "_treatment_indicator"]], X_cov], axis=1).dropna()

    if model_df.empty:
        return _build_unavailable_adjusted_result(
            reason="No rows remained after combining the outcome with usable covariates.",
            used_covariates=used_covariates,
            dropped_covariates=dropped_covariates,
            warnings=prep_warnings,
        )

    y = model_df[outcome_col].astype(float)
    X = model_df.drop(columns=[outcome_col])
    X = sm.add_constant(X, has_constant="add")

    X, y, sanitize_dropped, sanitize_warnings = _sanitize_design_matrix(X, y)
    dropped_covariates = dropped_covariates + sanitize_dropped
    all_warnings = prep_warnings + sanitize_warnings

    if X.empty or y.empty:
        return _build_unavailable_adjusted_result(
            reason="No usable rows remained after converting adjusted-analysis inputs to numeric.",
            used_covariates=used_covariates,
            dropped_covariates=dropped_covariates,
            warnings=all_warnings,
        )

    if X.shape[1] <= 1:
        return _build_unavailable_adjusted_result(
            reason="No usable covariate columns remained after numeric coercion.",
            used_covariates=[],
            dropped_covariates=dropped_covariates,
            warnings=all_warnings,
        )

    try:
        model = sm.OLS(y, X).fit()
    except Exception as exc:
        return _build_unavailable_adjusted_result(
            reason=f"Adjusted OLS model could not be fit safely: {str(exc)}",
            used_covariates=used_covariates,
            dropped_covariates=dropped_covariates,
            warnings=all_warnings,
        )

    treatment_coef = float(model.params["_treatment_indicator"])
    treatment_p = float(model.pvalues["_treatment_indicator"])
    treatment_ci = model.conf_int().loc["_treatment_indicator"]

    control_mean = float(model_df.loc[model_df["_treatment_indicator"] == 0, outcome_col].mean())
    adjusted_relative_lift = None if control_mean == 0 else treatment_coef / control_mean

    return {
        "status": "available",
        "method": "ols_regression",
        "covariates_used": used_covariates,
        "dropped_covariates": dropped_covariates,
        "warnings": all_warnings,
        "unavailable_reason": None,
        "coefficient": treatment_coef,
        "effect": {
            "absolute_lift": treatment_coef,
            "relative_lift": None if adjusted_relative_lift is None else float(adjusted_relative_lift),
        },
        "test_statistic": {
            "test_name": "ols_treatment_coefficient",
            "stat": treatment_coef,
            "p_value": treatment_p,
        },
        "confidence_interval_95": {
            "low": float(treatment_ci[0]),
            "high": float(treatment_ci[1]),
        },
        "note": "Adjusted continuous analysis uses OLS regression controlling for selected covariates.",
    }


def run_ab_analysis(payload: dict[str, Any]) -> dict[str, Any]:
    file_id = payload["file_id"]
    treatment_col = payload["treatment_column"]
    outcome_col = payload["outcome_column"]
    covariate_columns = payload.get("covariate_columns", []) or []

    df = _load_csv(file_id)

    if treatment_col not in df.columns or outcome_col not in df.columns:
        raise ValueError("Treatment or outcome column not found in dataset.")

    df, control_label, treatment_label = _build_treatment_indicator(df, treatment_col)
    metric_type = _detect_metric_type(df[outcome_col])

    if metric_type == "binary":
        df[outcome_col] = _normalize_binary_series(df[outcome_col])
        usable = df.dropna(subset=[outcome_col])

        control_values = usable.loc[usable["_treatment_indicator"] == 0, outcome_col]
        treatment_values = usable.loc[usable["_treatment_indicator"] == 1, outcome_col]

        control_success = int(control_values.sum())
        treatment_success = int(treatment_values.sum())
        control_n = int(len(control_values))
        treatment_n = int(len(treatment_values))

        if control_n == 0 or treatment_n == 0:
            raise ValueError("Both groups must contain usable outcome values.")

        unadjusted = _two_proportion_result(
            control_success=control_success,
            control_n=control_n,
            treatment_success=treatment_success,
            treatment_n=treatment_n,
        )

        adjusted = _adjusted_binary_result(
            df=usable,
            outcome_col=outcome_col,
            covariate_columns=covariate_columns,
        )

        absolute_lift = unadjusted["absolute_lift"]
        interpretation = (
            f"The {treatment_label} group has "
            f"{'a higher' if absolute_lift > 0 else 'a lower' if absolute_lift < 0 else 'the same'} "
            f"conversion rate than the {control_label} group "
            f"({(treatment_success / treatment_n) * 100:.2f}% vs {(control_success / control_n) * 100:.2f}%). "
            f"The estimated absolute lift is {absolute_lift * 100:.2f} percentage points, "
            f"{'and the result is statistically significant' if unadjusted['p_value'] < 0.05 else 'but the result is not statistically significant'} "
            f"(p = {unadjusted['p_value']:.4f}). The 95% confidence interval for the lift is "
            f"[{unadjusted['ci_low'] * 100:.2f}, {unadjusted['ci_high'] * 100:.2f}] percentage points."
        )

        return {
            "metric_type": "binary",
            "outcome_column": outcome_col,
            "groups": {
                "control_label": control_label,
                "treatment_label": treatment_label,
            },
            "sample_sizes": {
                control_label: control_n,
                treatment_label: treatment_n,
            },
            "outcome_rates": {
                control_label: float(control_success / control_n),
                treatment_label: float(treatment_success / treatment_n),
            },
            "effect": {
                "absolute_lift": unadjusted["absolute_lift"],
                "relative_lift": unadjusted["relative_lift"],
            },
            "test_statistic": {
                "test_name": unadjusted["test_name"],
                "stat": round(unadjusted["stat"], 4),
                "p_value": round(unadjusted["p_value"], 6),
            },
            "confidence_interval_95": {
                "low": unadjusted["ci_low"],
                "high": unadjusted["ci_high"],
            },
            "adjusted_analysis": adjusted,
            "interpretation": interpretation,
        }

    usable = df.copy()
    usable[outcome_col] = pd.to_numeric(usable[outcome_col], errors="coerce")
    usable = usable.dropna(subset=[outcome_col])

    control_values = usable.loc[usable["_treatment_indicator"] == 0, outcome_col]
    treatment_values = usable.loc[usable["_treatment_indicator"] == 1, outcome_col]

    if len(control_values) == 0 or len(treatment_values) == 0:
        raise ValueError("Both groups must contain usable outcome values.")

    unadjusted = _continuous_result(control_values, treatment_values)

    adjusted = _adjusted_continuous_result(
        df=usable,
        outcome_col=outcome_col,
        covariate_columns=covariate_columns,
    )

    absolute_lift = unadjusted["absolute_lift"]
    interpretation = (
        f"The {treatment_label} group has "
        f"{'a higher' if absolute_lift > 0 else 'a lower' if absolute_lift < 0 else 'the same'} "
        f"average outcome than the {control_label} group "
        f"({treatment_values.mean():.2f} vs {control_values.mean():.2f}). "
        f"The estimated absolute lift is {absolute_lift:.2f}, "
        f"{'and the result is statistically significant' if unadjusted['p_value'] < 0.05 else 'but the result is not statistically significant'} "
        f"(p = {unadjusted['p_value']:.4f}). The 95% confidence interval is "
        f"[{unadjusted['ci_low']:.2f}, {unadjusted['ci_high']:.2f}]."
    )

    return {
        "metric_type": "continuous",
        "outcome_column": outcome_col,
        "groups": {
            "control_label": control_label,
            "treatment_label": treatment_label,
        },
        "sample_sizes": {
            control_label: int(len(control_values)),
            treatment_label: int(len(treatment_values)),
        },
        "outcome_means": {
            control_label: float(control_values.mean()),
            treatment_label: float(treatment_values.mean()),
        },
        "effect": {
            "absolute_lift": unadjusted["absolute_lift"],
            "relative_lift": unadjusted["relative_lift"],
        },
        "test_statistic": {
            "test_name": unadjusted["test_name"],
            "stat": round(unadjusted["stat"], 4),
            "p_value": round(unadjusted["p_value"], 6),
        },
        "confidence_interval_95": {
            "low": unadjusted["ci_low"],
            "high": unadjusted["ci_high"],
        },
        "adjusted_analysis": adjusted,
        "interpretation": interpretation,
    }