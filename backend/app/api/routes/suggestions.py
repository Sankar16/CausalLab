from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services.mapping_suggester import suggest_mapping

router = APIRouter(tags=["Suggestions"])


class MappingSuggestionRequest(BaseModel):
    file_id: str


@router.post("/suggest-mapping")
async def suggest_mapping_route(payload: MappingSuggestionRequest):
    try:
        return suggest_mapping(payload.file_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Mapping suggestion failed: {str(exc)}") from exc