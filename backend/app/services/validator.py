from __future__ import annotations

from pathlib import Path
import pandas as pd


UPLOAD_DIR = Path(__file__).resolve().parents[2] / "uploads"


def validate_column_mapping(payload: dict) -> dict:
    file_id = payload["file_id"]
    file_path = UPLOAD_DIR / file_id

    if not file_path.exists():
        raise FileNotFoundError("Uploaded file not found.")

    df = pd.read_csv(file_path)

    columns = set(df.columns)

    required_columns = [payload["treatment_column"], payload["outcome_column"]]
    optional_columns = [
        payload.get("user_id_column"),
        payload.get("timestamp_column"),
        payload.get("pre_period_column"),
    ]
    covariates = payload.get("covariate_columns", [])

    selected_columns = [col for col in required_columns + optional_columns + covariates if col]

    missing_selected = [col for col in selected_columns if col not in columns]
    if missing_selected:
        return {
            "valid": False,
            "errors": [f"Selected columns not found in dataset: {missing_selected}"],
            "summary": {},
        }

    treatment_column = payload["treatment_column"]
    outcome_column = payload["outcome_column"]

    treatment_non_null = df[treatment_column].dropna()
    unique_treatment_values = treatment_non_null.unique().tolist()

    errors = []
    warnings = []

    if len(unique_treatment_values) != 2:
        errors.append(
            f"Treatment column must have exactly 2 unique non-null groups. Found {len(unique_treatment_values)}: {unique_treatment_values}"
        )

    outcome_series = df[outcome_column]

    is_numeric = pd.api.types.is_numeric_dtype(outcome_series)
    non_null_values = outcome_series.dropna()

    binary_values = set(non_null_values.unique().tolist()) if len(non_null_values) > 0 else set()
    is_binary = binary_values.issubset({0, 1, True, False})

    if not is_numeric and not is_binary:
        errors.append(
            "Outcome column must be numeric for v1. Supported outcomes are binary (0/1) or continuous numeric."
        )

    if payload.get("pre_period_column"):
        pre_col = payload["pre_period_column"]
        if not pd.api.types.is_numeric_dtype(df[pre_col]):
            errors.append("Pre-period column must be numeric.")

    if payload.get("timestamp_column"):
        timestamp_col = payload["timestamp_column"]
        try:
            pd.to_datetime(df[timestamp_col])
        except Exception:
            warnings.append("Timestamp column could not be cleanly parsed as datetime.")

    outcome_type = "binary" if is_binary else "continuous"

    return {
        "valid": len(errors) == 0,
        "errors": errors,
        "warnings": warnings,
        "summary": {
            "treatment_column": treatment_column,
            "outcome_column": outcome_column,
            "treatment_groups": unique_treatment_values,
            "outcome_type": outcome_type,
            "covariate_count": len(covariates),
            "row_count": int(df.shape[0]),
        },
    }