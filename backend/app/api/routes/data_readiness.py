from fastapi import APIRouter, HTTPException

from app.models.schemas import ColumnValidationRequest
from app.services.data_readiness import run_data_readiness_checks

router = APIRouter(tags=["Data Readiness"])


@router.post("/data-readiness")
async def data_readiness(payload: ColumnValidationRequest):
    try:
        return run_data_readiness_checks(payload.model_dump())
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Data readiness check failed: {str(exc)}",
        ) from exc