from fastapi import APIRouter, HTTPException

from app.models.schemas import ApplyFixesRequest
from app.services.fix_service import apply_safe_fixes

router = APIRouter(tags=["Fixes"])


@router.post("/apply-fixes")
async def apply_fixes_route(payload: ApplyFixesRequest):
    try:
        return apply_safe_fixes(payload.model_dump())
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Apply fixes failed: {str(exc)}") from exc