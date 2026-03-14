from __future__ import annotations

from pathlib import Path
from typing import Any
import uuid

import pandas as pd


UPLOAD_DIR = Path(__file__).resolve().parents[2] / "uploads"


def _load_csv(file_id: str) -> pd.DataFrame:
    file_path = UPLOAD_DIR / file_id
    if not file_path.exists():
        raise FileNotFoundError("Uploaded file not found.")
    return pd.read_csv(file_path)


def _save_cleaned_csv(df: pd.DataFrame) -> str:
    new_file_id = f"{uuid.uuid4().hex}.csv"
    output_path = UPLOAD_DIR / new_file_id
    df.to_csv(output_path, index=False)
    return new_file_id


def _normalize_empty_strings(df: pd.DataFrame) -> tuple[pd.DataFrame, int]:
    cleaned = df.copy()
    changed = 0

    replacements = {
        "": pd.NA,
        " ": pd.NA,
        "NA": pd.NA,
        "N/A": pd.NA,
        "null": pd.NA,
        "None": pd.NA,
    }

    for col in cleaned.columns:
        if pd.api.types.is_object_dtype(cleaned[col]) or pd.api.types.is_string_dtype(cleaned[col]):
            original = cleaned[col].copy()
            cleaned[col] = cleaned[col].replace(replacements)
            changed += int((original.astype(str) != cleaned[col].astype(str)).sum())

    return cleaned, changed


def _standardize_labels(series: pd.Series) -> tuple[pd.Series, int]:
    original = series.copy()

    def normalize(value: Any) -> Any:
        if pd.isna(value):
            return pd.NA
        value = str(value).strip().lower()
        value = " ".join(value.split())
        return value if value else pd.NA

    cleaned = series.apply(normalize)
    changed = int((original.astype(str) != cleaned.astype(str)).sum())
    return cleaned, changed


def _coerce_binary_outcome(series: pd.Series) -> tuple[pd.Series, int]:
    original = series.copy()

    mapping = {
        "1": 1,
        "0": 0,
        "true": 1,
        "false": 0,
        "True": 1,
        "False": 0,
        "yes": 1,
        "no": 0,
        "Yes": 1,
        "No": 0,
        1: 1,
        0: 0,
        True: 1,
        False: 0,
    }

    def normalize(value: Any) -> Any:
        if pd.isna(value):
            return pd.NA

        if value in mapping:
            return mapping[value]

        text = str(value).strip()
        if text in mapping:
            return mapping[text]

        lowered = text.lower()
        if lowered in mapping:
            return mapping[lowered]

        return pd.NA

    cleaned = series.apply(normalize)
    cleaned = pd.to_numeric(cleaned, errors="coerce")

    changed = int((original.astype(str) != cleaned.astype(str)).sum())
    return cleaned, changed


def _snapshot(df: pd.DataFrame, treatment_col: str, outcome_col: str) -> dict[str, Any]:
    treatment_non_null = df[treatment_col].dropna() if treatment_col in df.columns else pd.Series(dtype="object")
    unique_groups = sorted([str(v) for v in treatment_non_null.unique().tolist()]) if len(treatment_non_null) else []

    return {
        "row_count": int(len(df)),
        "duplicate_rows": int(df.duplicated().sum()),
        "missing_treatment_rows": int(df[treatment_col].isna().sum()) if treatment_col in df.columns else None,
        "missing_outcome_rows": int(df[outcome_col].isna().sum()) if outcome_col in df.columns else None,
        "treatment_group_count": int(len(unique_groups)),
        "treatment_groups": unique_groups,
    }


def apply_safe_fixes(payload: dict[str, Any]) -> dict[str, Any]:
    file_id = payload["file_id"]
    treatment_col = payload["treatment_column"]
    outcome_col = payload["outcome_column"]
    fixes = payload.get("fixes", {})

    df = _load_csv(file_id)

    before_summary = _snapshot(df, treatment_col, outcome_col)

    applied_fixes: list[str] = []
    change_summary: dict[str, int] = {}
    fix_details: list[dict[str, Any]] = []

    if fixes.get("normalize_empty_strings"):
        df, changed = _normalize_empty_strings(df)
        applied_fixes.append("normalize_empty_strings")
        change_summary["normalized_empty_string_values"] = changed
        fix_details.append(
            {
                "key": "normalize_empty_strings",
                "label": "Normalized empty strings to null values",
                "count": changed,
            }
        )

    if fixes.get("standardize_treatment_labels"):
        if treatment_col not in df.columns:
            raise ValueError("Treatment column not found for label standardization.")
        df[treatment_col], changed = _standardize_labels(df[treatment_col])
        applied_fixes.append("standardize_treatment_labels")
        change_summary["standardized_treatment_values"] = changed
        fix_details.append(
            {
                "key": "standardize_treatment_labels",
                "label": "Standardized treatment labels",
                "count": changed,
            }
        )

    if fixes.get("coerce_binary_outcome"):
        if outcome_col not in df.columns:
            raise ValueError("Outcome column not found for binary coercion.")
        df[outcome_col], changed = _coerce_binary_outcome(df[outcome_col])
        applied_fixes.append("coerce_binary_outcome")
        change_summary["coerced_outcome_values"] = changed
        fix_details.append(
            {
                "key": "coerce_binary_outcome",
                "label": "Coerced binary outcome values",
                "count": changed,
            }
        )

    if fixes.get("drop_duplicate_rows"):
        before = len(df)
        df = df.drop_duplicates().reset_index(drop=True)
        dropped = int(before - len(df))
        applied_fixes.append("drop_duplicate_rows")
        change_summary["dropped_duplicate_rows"] = dropped
        fix_details.append(
            {
                "key": "drop_duplicate_rows",
                "label": "Removed duplicate rows",
                "count": dropped,
            }
        )

    if fixes.get("drop_missing_treatment_rows"):
        if treatment_col not in df.columns:
            raise ValueError("Treatment column not found for missing-value drop.")
        before = len(df)
        df = df[df[treatment_col].notna()].reset_index(drop=True)
        dropped = int(before - len(df))
        applied_fixes.append("drop_missing_treatment_rows")
        change_summary["dropped_missing_treatment_rows"] = dropped
        fix_details.append(
            {
                "key": "drop_missing_treatment_rows",
                "label": "Dropped rows with missing treatment",
                "count": dropped,
            }
        )

    if fixes.get("drop_missing_outcome_rows"):
        if outcome_col not in df.columns:
            raise ValueError("Outcome column not found for missing-value drop.")
        before = len(df)
        df = df[df[outcome_col].notna()].reset_index(drop=True)
        dropped = int(before - len(df))
        applied_fixes.append("drop_missing_outcome_rows")
        change_summary["dropped_missing_outcome_rows"] = dropped
        fix_details.append(
            {
                "key": "drop_missing_outcome_rows",
                "label": "Dropped rows with missing outcome",
                "count": dropped,
            }
        )

    after_summary = _snapshot(df, treatment_col, outcome_col)

    new_file_id = _save_cleaned_csv(df)

    return {
        "original_file_id": file_id,
        "new_file_id": new_file_id,
        "applied_fixes": applied_fixes,
        "change_summary": change_summary,
        "fix_details": fix_details,
        "before_summary": before_summary,
        "after_summary": after_summary,
        "row_count_after_fixes": int(len(df)),
    }