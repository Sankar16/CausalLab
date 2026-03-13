from __future__ import annotations

from fastapi import APIRouter, File, HTTPException, UploadFile

from app.services.file_service import save_uploaded_file
from app.services.profiler import profile_csv

router = APIRouter(prefix="/upload", tags=["Upload"])


@router.post("/")
async def upload_dataset(file: UploadFile = File(...)):
    try:
        file_info = save_uploaded_file(file)
        profile = profile_csv(file_info["saved_path"])

        return {
            "message": "File uploaded successfully",
            "file_id": file_info["file_id"],
            "original_filename": file_info["original_filename"],
            "profile": profile,
        }

    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(exc)}") from exc