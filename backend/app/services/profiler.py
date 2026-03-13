from __future__ import annotations

from pathlib import Path
import pandas as pd


def profile_csv(file_path: str, preview_rows: int = 5) -> dict:
    path = Path(file_path)
    df = pd.read_csv(path)

    return {
        "row_count": int(df.shape[0]),
        "column_count": int(df.shape[1]),
        "columns": df.columns.tolist(),
        "dtypes": {col: str(dtype) for col, dtype in df.dtypes.items()},
        "missing_counts": {col: int(df[col].isna().sum()) for col in df.columns},
        "preview": df.head(preview_rows).to_dict(orient="records"),
    }