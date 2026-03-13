from fastapi import APIRouter, HTTPException

from app.models.schemas import ColumnValidationRequest
from app.services.validator import validate_column_mapping

router = APIRouter(tags=["Validation"])


@router.post("/validate-columns")
async def validate_columns(payload: ColumnValidationRequest):
    try:
        result = validate_column_mapping(payload.model_dump())
        return result
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Validation failed: {str(exc)}") from exc