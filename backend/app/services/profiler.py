from __future__ import annotations

import math
from pathlib import Path
from typing import Any

import pandas as pd


def _normalize_dtype(dtype: Any) -> str:
    if pd.api.types.is_string_dtype(dtype) or pd.api.types.is_object_dtype(dtype):
        return "str"
    if pd.api.types.is_bool_dtype(dtype):
        return "bool"
    if pd.api.types.is_integer_dtype(dtype):
        return "int64"
    if pd.api.types.is_float_dtype(dtype):
        return "float64"
    if pd.api.types.is_datetime64_any_dtype(dtype):
        return "datetime"
    return str(dtype)


def _sanitize_value(value: Any) -> Any:
    try:
        if pd.isna(value):
            return None
    except Exception:
        pass

    if isinstance(value, float):
        if math.isnan(value) or math.isinf(value):
            return None

    # Convert pandas / numpy scalars to native Python where possible
    if hasattr(value, "item"):
        try:
            value = value.item()
        except Exception:
            pass

    return value


def _sanitize_records(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    sanitized: list[dict[str, Any]] = []
    for row in records:
        sanitized_row = {}
        for key, value in row.items():
            sanitized_row[key] = _sanitize_value(value)
        sanitized.append(sanitized_row)
    return sanitized


def _safe_preview(df: pd.DataFrame, n: int = 5) -> list[dict[str, Any]]:
    preview_df = df.head(n).copy()
    return _sanitize_records(preview_df.to_dict(orient="records"))


def profile_csv(file_path: str | Path) -> dict[str, Any]:
    file_path = Path(file_path)

    if not file_path.exists():
        raise FileNotFoundError(f"CSV file not found: {file_path}")

    # Keep default NA parsing so readiness/diagnostics can detect real missingness
    df = pd.read_csv(file_path)

    dtypes = {column: _normalize_dtype(dtype) for column, dtype in df.dtypes.items()}
    missing_counts = {column: int(df[column].isna().sum()) for column in df.columns}

    profile = {
        "row_count": int(len(df)),
        "column_count": int(len(df.columns)),
        "columns": df.columns.tolist(),
        "dtypes": dtypes,
        "missing_counts": missing_counts,
        "preview": _safe_preview(df, n=5),
    }

    return profile