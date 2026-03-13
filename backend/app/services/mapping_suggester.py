from __future__ import annotations

from pathlib import Path
from typing import Any

import pandas as pd


UPLOAD_DIR = Path(__file__).resolve().parents[2] / "uploads"


TREATMENT_KEYWORDS = ["group", "variant", "treatment", "test", "arm", "bucket"]
OUTCOME_KEYWORDS = ["converted", "conversion", "revenue", "purchase", "clicked", "outcome", "sales"]
USER_ID_KEYWORDS = ["user_id", "userid", "user id", "customer_id", "visitor_id", "member_id"]
TIMESTAMP_KEYWORDS = ["timestamp", "datetime", "date", "time", "event_time", "created_at"]
COVARIATE_EXCLUDE_KEYWORDS = [
    "revenue",
    "sales",
    "purchase",
    "converted",
    "conversion",
    "clicked",
    "click",
    "outcome",
]


def suggest_mapping(file_id: str) -> dict[str, Any]:
    file_path = UPLOAD_DIR / file_id
    if not file_path.exists():
        raise FileNotFoundError("Uploaded file not found.")

    df = pd.read_csv(file_path)
    columns = list(df.columns)

    treatment_col, treatment_reason = suggest_treatment_column(df, columns)
    outcome_col, outcome_reason = suggest_outcome_column(df, columns)
    user_id_col, user_id_reason = suggest_user_id_column(df, columns)
    timestamp_col, timestamp_reason = suggest_timestamp_column(df, columns)

    chosen = {c for c in [treatment_col, outcome_col, user_id_col, timestamp_col] if c}
    covariates, covariate_reasons = suggest_covariates(df, columns, chosen)

    return {
        "suggested_mapping": {
            "treatment_column": treatment_col,
            "outcome_column": outcome_col,
            "user_id_column": user_id_col,
            "timestamp_column": timestamp_col,
            "covariate_columns": covariates,
        },
        "reasoning": {
            "treatment_column": treatment_reason,
            "outcome_column": outcome_reason,
            "user_id_column": user_id_reason,
            "timestamp_column": timestamp_reason,
            "covariate_columns": covariate_reasons,
        },
    }


def normalize_name(name: str) -> str:
    return name.strip().lower()


def score_name(name: str, keywords: list[str]) -> int:
    normalized = normalize_name(name)
    score = 0
    for keyword in keywords:
        if keyword in normalized:
            score += 3
    return score

def looks_like_alternate_outcome(column_name: str) -> bool:
    normalized = normalize_name(column_name)
    return any(keyword in normalized for keyword in COVARIATE_EXCLUDE_KEYWORDS)

def is_row_index_column(series: pd.Series, column_name: str) -> bool:
    normalized = normalize_name(column_name)
    if normalized.startswith("unnamed"):
        return True
    if normalized in {"index", "row_id", "rowid"}:
        return True
    return False


def suggest_treatment_column(df: pd.DataFrame, columns: list[str]) -> tuple[str | None, str]:
    best_col = None
    best_score = -1
    best_reason = "No strong treatment column detected."

    for col in columns:
        series = df[col]
        nunique = series.nunique(dropna=True)
        score = score_name(col, TREATMENT_KEYWORDS)

        if 2 <= nunique <= 5:
            score += 2
        if pd.api.types.is_object_dtype(series) or pd.api.types.is_bool_dtype(series):
            score += 1

        if score > best_score:
            best_score = score
            best_col = col
            best_reason = (
                f"Column name suggests experiment grouping and it has {nunique} unique values."
            )

    return best_col, best_reason


def suggest_outcome_column(df: pd.DataFrame, columns: list[str]) -> tuple[str | None, str]:
    best_col = None
    best_score = -1
    best_reason = "No strong outcome column detected."

    for col in columns:
        if is_row_index_column(df[col], col):
            continue

        series = df[col]
        score = score_name(col, OUTCOME_KEYWORDS)

        unique_values = set(series.dropna().unique().tolist())

        if pd.api.types.is_bool_dtype(series):
            score += 5
        elif unique_values.issubset({0, 1, True, False}):
            score += 5
        elif pd.api.types.is_numeric_dtype(series):
            score += 3

        if score > best_score:
            best_score = score
            best_col = col

            if pd.api.types.is_bool_dtype(series) or unique_values.issubset({0, 1, True, False}):
                best_reason = "Column name suggests an outcome metric and values are binary."
            elif pd.api.types.is_numeric_dtype(series):
                best_reason = "Column name suggests an outcome metric and values are numeric."
            else:
                best_reason = "Column name suggests an outcome metric."

    return best_col, best_reason


def suggest_user_id_column(df: pd.DataFrame, columns: list[str]) -> tuple[str | None, str]:
    best_col = None
    best_score = -1
    best_reason = "No strong user identifier detected."

    for col in columns:
        if is_row_index_column(df[col], col):
            continue

        series = df[col]
        score = score_name(col, USER_ID_KEYWORDS)

        uniqueness_ratio = series.nunique(dropna=True) / max(len(series), 1)
        if uniqueness_ratio > 0.8:
            score += 2

        if score > best_score:
            best_score = score
            best_col = col
            best_reason = "Column name suggests a user identifier and values appear mostly unique."

    if best_score <= 0:
        return None, "No strong user identifier detected."

    return best_col, best_reason


def suggest_timestamp_column(df: pd.DataFrame, columns: list[str]) -> tuple[str | None, str]:
    best_col = None
    best_score = -1
    best_reason = "No strong timestamp column detected."

    for col in columns:
        series = df[col]
        score = score_name(col, TIMESTAMP_KEYWORDS)

        sample = series.dropna().astype(str).head(50)
        parsed = pd.to_datetime(sample, errors="coerce")
        parse_rate = parsed.notna().mean() if len(sample) > 0 else 0

        if parse_rate > 0.7:
            score += 3

        if score > best_score:
            best_score = score
            best_col = col
            best_reason = (
                f"Column name suggests time information and approximately {parse_rate:.0%} of sampled values parse as timestamps."
            )

    if best_score <= 0:
        return None, "No strong timestamp column detected."

    return best_col, best_reason


def suggest_covariates(
    df: pd.DataFrame, columns: list[str], chosen_columns: set[str]
) -> tuple[list[str], list[str]]:
    scored_covariates: list[tuple[int, str, str]] = []

    for col in columns:
        if col in chosen_columns:
            continue
        if is_row_index_column(df[col], col):
            continue
        if looks_like_alternate_outcome(col):
            continue

        series = df[col]
        nunique = series.nunique(dropna=True)

        score = 0
        reason = ""

        # Prefer useful categorical baseline/context variables
        if pd.api.types.is_object_dtype(series) or pd.api.types.is_bool_dtype(series):
            if 2 <= nunique <= 20:
                score += 4
                reason = f"{col}: categorical column that may describe user context."

        # Prefer numeric variables that look like baseline/user-history style features
        elif pd.api.types.is_numeric_dtype(series):
            if nunique > 2:
                score += 3
                reason = f"{col}: numeric column that may explain baseline variation."

                normalized = normalize_name(col)
                if any(
                    keyword in normalized
                    for keyword in ["prior", "pre_", "pre ", "days_since", "history", "past"]
                ):
                    score += 2

        if score > 0:
            scored_covariates.append((score, col, reason))

    # Sort highest score first, then by column name
    scored_covariates.sort(key=lambda x: (-x[0], x[1]))

    covariates = [col for _, col, _ in scored_covariates[:5]]
    reasons = [reason for _, _, reason in scored_covariates[:5]]

    return covariates, reasons