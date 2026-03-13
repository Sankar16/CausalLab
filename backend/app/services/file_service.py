from __future__ import annotations

from pathlib import Path
from uuid import uuid4
from fastapi import UploadFile


UPLOAD_DIR = Path(__file__).resolve().parents[2] / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


def save_uploaded_file(upload_file: UploadFile) -> dict:
    file_extension = Path(upload_file.filename).suffix.lower()

    if file_extension != ".csv":
        raise ValueError("Only CSV files are supported in v1.")

    generated_name = f"{uuid4().hex}{file_extension}"
    saved_path = UPLOAD_DIR / generated_name

    with saved_path.open("wb") as buffer:
        buffer.write(upload_file.file.read())

    return {
        "file_id": generated_name,
        "original_filename": upload_file.filename,
        "saved_path": str(saved_path),
    }