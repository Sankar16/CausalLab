from __future__ import annotations

from pathlib import Path
from typing import Any

import pandas as pd


UPLOAD_DIR = Path(__file__).resolve().parents[2] / "uploads"


def detect_outcome_type(series: pd.Series) -> str:
    non_null = series.dropna()
    unique_values = set(non_null.unique().tolist()) if len(non_null) > 0 else set()

    if len(non_null) == 0:
        return "unknown"

    if pd.api.types.is_bool_dtype(series) or unique_values.issubset({0, 1, True, False}):
        return "binary"

    if pd.api.types.is_numeric_dtype(series):
        return "continuous"

    return "unknown"


def run_data_readiness_checks(payload: dict[str, Any]) -> dict[str, Any]:
    file_id = payload["file_id"]
    file_path = UPLOAD_DIR / file_id

    if not file_path.exists():
        raise FileNotFoundError("Uploaded file not found.")

    df = pd.read_csv(file_path)

    treatment_col = payload["treatment_column"]
    outcome_col = payload["outcome_column"]
    user_id_col = payload.get("user_id_column")
    timestamp_col = payload.get("timestamp_column")
    covariate_cols = payload.get("covariate_columns") or []
    pre_period_col = payload.get("pre_period_column")

    required_columns = [treatment_col, outcome_col]
    optional_columns = [user_id_col, timestamp_col, pre_period_col] + covariate_cols
    selected_columns = [col for col in required_columns + optional_columns if col]

    missing_selected = [col for col in selected_columns if col not in df.columns]
    if missing_selected:
        raise ValueError(
            f"Selected columns not found in dataset: {', '.join(missing_selected)}"
        )

    checks: list[dict[str, str]] = []
    recommended_actions: list[str] = []

    row_count = int(len(df))
    duplicate_rows = int(df.duplicated().sum())
    missing_treatment_rows = int(df[treatment_col].isna().sum())
    missing_outcome_rows = int(df[outcome_col].isna().sum())
    treatment_group_count = int(df[treatment_col].dropna().nunique())
    outcome_detected_type = detect_outcome_type(df[outcome_col])

    # Duplicate rows
    if duplicate_rows == 0:
        checks.append(
            {
                "name": "duplicate_rows",
                "status": "pass",
                "message": "No duplicate rows detected.",
            }
        )
    else:
        checks.append(
            {
                "name": "duplicate_rows",
                "status": "warning",
                "message": f"{duplicate_rows} duplicate rows detected.",
            }
        )
        recommended_actions.append("Drop duplicate rows before analysis.")

    # Missing treatment
    if missing_treatment_rows == 0:
        checks.append(
            {
                "name": "missing_treatment",
                "status": "pass",
                "message": "No missing treatment values detected.",
            }
        )
    else:
        checks.append(
            {
                "name": "missing_treatment",
                "status": "critical",
                "message": f"Treatment column contains {missing_treatment_rows} missing values.",
            }
        )
        recommended_actions.append("Drop rows with missing treatment values before analysis.")

    # Missing outcome
    if missing_outcome_rows == 0:
        checks.append(
            {
                "name": "missing_outcome",
                "status": "pass",
                "message": "No missing outcome values detected.",
            }
        )
    else:
        checks.append(
            {
                "name": "missing_outcome",
                "status": "warning",
                "message": f"Outcome column contains {missing_outcome_rows} missing values.",
            }
        )
        recommended_actions.append("Drop rows with missing outcome values before analysis.")

    # Treatment group count
    if treatment_group_count == 2:
        checks.append(
            {
                "name": "treatment_group_count",
                "status": "pass",
                "message": "Exactly 2 treatment groups detected.",
            }
        )
    elif treatment_group_count < 2:
        checks.append(
            {
                "name": "treatment_group_count",
                "status": "critical",
                "message": f"Only {treatment_group_count} treatment group detected. At least 2 groups are required.",
            }
        )
    else:
        checks.append(
            {
                "name": "treatment_group_count",
                "status": "warning",
                "message": f"{treatment_group_count} treatment groups detected. Current analysis flow is designed for 2-group experiments.",
            }
        )
        recommended_actions.append(
            "Restrict the dataset or mapping to the 2 treatment groups you want to compare."
        )

    # Outcome type
    if outcome_detected_type == "binary":
        checks.append(
            {
                "name": "outcome_type",
                "status": "pass",
                "message": "Outcome appears to be binary.",
            }
        )
    elif outcome_detected_type == "continuous":
        checks.append(
            {
                "name": "outcome_type",
                "status": "pass",
                "message": "Outcome appears to be continuous.",
            }
        )
    else:
        checks.append(
            {
                "name": "outcome_type",
                "status": "warning",
                "message": "Outcome type could not be confidently determined as binary or continuous.",
            }
        )
        recommended_actions.append(
            "Review the outcome column and ensure it is numeric or binary before analysis."
        )

    # Binary validity check
    if outcome_detected_type == "binary":
        non_null_outcome = df[outcome_col].dropna()
        unique_values = set(non_null_outcome.unique().tolist())
        if unique_values.issubset({0, 1, True, False}):
            checks.append(
                {
                    "name": "binary_outcome_validity",
                    "status": "pass",
                    "message": "Binary outcome values are valid.",
                }
            )
        else:
            checks.append(
                {
                    "name": "binary_outcome_validity",
                    "status": "critical",
                    "message": "Binary outcome contains unexpected values.",
                }
            )
            recommended_actions.append(
                "Convert the outcome column to clean binary values such as 0/1 before analysis."
            )

    # Numeric coercion check for outcome
    if outcome_detected_type == "unknown":
        coerced_outcome = pd.to_numeric(df[outcome_col], errors="coerce")
        parse_rate = float(coerced_outcome.notna().mean()) if len(df) > 0 else 0.0

        if parse_rate >= 0.95:
            checks.append(
                {
                    "name": "outcome_numeric_coercion",
                    "status": "warning",
                    "message": f"Outcome is not currently numeric, but about {parse_rate:.0%} of rows could be coerced to numeric.",
                }
            )
            recommended_actions.append(
                "Safely coerce the outcome column to numeric before analysis."
            )
        else:
            checks.append(
                {
                    "name": "outcome_numeric_coercion",
                    "status": "warning",
                    "message": f"Outcome column has low numeric parse success ({parse_rate:.0%}).",
                }
            )

    # Timestamp parse check
    if timestamp_col:
        sample = df[timestamp_col].dropna().astype(str).head(200)
        parsed = pd.to_datetime(sample, errors="coerce")
        parse_rate = float(parsed.notna().mean()) if len(sample) > 0 else 0.0

        if parse_rate >= 0.9:
            checks.append(
                {
                    "name": "timestamp_parse",
                    "status": "pass",
                    "message": f"Timestamp column parses successfully for about {parse_rate:.0%} of sampled rows.",
                }
            )
        elif parse_rate >= 0.5:
            checks.append(
                {
                    "name": "timestamp_parse",
                    "status": "warning",
                    "message": f"Timestamp column parses successfully for only about {parse_rate:.0%} of sampled rows.",
                }
            )
            recommended_actions.append(
                "Review timestamp formatting before using time-based logic."
            )
        else:
            checks.append(
                {
                    "name": "timestamp_parse",
                    "status": "warning",
                    "message": "Timestamp column has poor parse success.",
                }
            )
            recommended_actions.append(
                "Review or reformat the timestamp column before using time-based logic."
            )

    # Covariate numeric coercion checks
    covariate_issues: list[str] = []
    for col in covariate_cols:
        if col not in df.columns:
            covariate_issues.append(f"{col} (column not found)")
            continue

        # Numeric covariates are fine
        if pd.api.types.is_numeric_dtype(df[col]) or pd.api.types.is_bool_dtype(df[col]):
            continue

        # Categorical/string covariates are also acceptable
        if pd.api.types.is_object_dtype(df[col]) or pd.api.types.is_string_dtype(df[col]):
            continue

        # Only warn if truly unusual/unusable
        covariate_issues.append(f"{col} (unsupported dtype)")

    if len(covariate_issues) == 0:
        checks.append(
            {
                "name": "covariate_readiness",
                "status": "pass",
                "message": "Selected covariates appear usable as-is.",
            }
        )
    else:
        checks.append(
            {
                "name": "covariate_readiness",
                "status": "warning",
                "message": "Some selected covariates may need cleanup: " + ", ".join(covariate_issues),
            }
        )
        recommended_actions.append(
            "Review selected covariates and coerce or clean them before adjusted analysis."
        )

    # Final readiness status
    statuses = [check["status"] for check in checks]
    if "critical" in statuses:
        readiness_status = "not_ready"
    elif "warning" in statuses:
        readiness_status = "needs_review"
    else:
        readiness_status = "ready"

    return {
        "summary": {
            "row_count": row_count,
            "duplicate_rows": duplicate_rows,
            "missing_treatment_rows": missing_treatment_rows,
            "missing_outcome_rows": missing_outcome_rows,
            "treatment_group_count": treatment_group_count,
            "outcome_detected_type": outcome_detected_type,
        },
        "checks": checks,
        "recommended_actions": recommended_actions,
        "readiness_status": readiness_status,
    }