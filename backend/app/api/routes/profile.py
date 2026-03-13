from pathlib import Path

from fastapi import APIRouter, HTTPException

from app.models.schemas import ColumnValidationRequest
from app.services.profiler import profile_csv
from app.services.validator import validate_column_mapping

router = APIRouter(tags=["Validation"])


@router.get("/profile/{file_id}")
async def get_profile(file_id: str):
    try:
        upload_dir = Path(__file__).resolve().parents[3] / "uploads"
        file_path = upload_dir / file_id

        if not file_path.exists():
            raise FileNotFoundError("Uploaded file not found.")

        profile = profile_csv(str(file_path))
        return {
            "file_id": file_id,
            "profile": profile,
        }
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Profile fetch failed: {str(exc)}") from exc


@router.post("/validate-columns")
async def validate_columns(payload: ColumnValidationRequest):
    try:
        result = validate_column_mapping(payload.model_dump())
        return result
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Validation failed: {str(exc)}") from exc