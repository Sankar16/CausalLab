from fastapi import APIRouter, HTTPException

from app.models.schemas import ColumnValidationRequest
from app.services.ab_analysis import run_ab_analysis
from app.services.diagnostics import run_experiment_diagnostics

router = APIRouter(tags=["Diagnostics & Analysis"])


@router.post("/diagnostics")
async def diagnostics(payload: ColumnValidationRequest):
    try:
        result = run_experiment_diagnostics(payload.model_dump())
        return result
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Diagnostics failed: {str(exc)}") from exc


@router.post("/analyze")
async def analyze(payload: ColumnValidationRequest):
    try:
        result = run_ab_analysis(payload.model_dump())
        return result
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(exc)}") from exc