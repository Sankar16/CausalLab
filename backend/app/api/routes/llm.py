from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Any, Optional

from app.services.llm_summary import generate_llm_summary


class LLMSummaryRequest(BaseModel):
    diagnostics: dict[str, Any]
    analysis: dict[str, Any]
    trust_score: Optional[dict[str, Any]] = None


router = APIRouter(tags=["LLM Summary"])


@router.post("/llm-summary")
async def llm_summary(payload: LLMSummaryRequest):
    try:
        return generate_llm_summary(payload.model_dump())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"LLM summary failed: {str(exc)}") from exc