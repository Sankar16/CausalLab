from pydantic import BaseModel, Field
from typing import List, Optional


class ColumnValidationRequest(BaseModel):
    file_id: str
    treatment_column: str
    outcome_column: str
    user_id_column: Optional[str] = None
    timestamp_column: Optional[str] = None
    covariate_columns: List[str] = Field(default_factory=list)
    pre_period_column: Optional[str] = None