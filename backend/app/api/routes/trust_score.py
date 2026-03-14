from fastapi import APIRouter, HTTPException

from app.models.schemas import TrustScoreRequest
from app.services.trust_score import compute_trust_score

router = APIRouter(tags=["Trust Score"])


@router.post("/trust-score")
async def trust_score_route(payload: TrustScoreRequest):
    try:
        return compute_trust_score(payload.model_dump())
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Trust score failed: {str(exc)}") from exc