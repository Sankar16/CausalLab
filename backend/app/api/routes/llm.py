from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Any, Dict, Optional

from app.services.llm_summary import generate_executive_summary

router = APIRouter(tags=["LLM Summary"])


class LLMSummaryRequest(BaseModel):
    diagnostics: Dict[str, Any]
    analysis: Dict[str, Any]
    metadata: Optional[Dict[str, Any]] = None


@router.post("/llm-summary")
async def llm_summary(payload: LLMSummaryRequest):
    try:
        return generate_executive_summary(payload.model_dump())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"LLM summary failed: {str(exc)}") from exc