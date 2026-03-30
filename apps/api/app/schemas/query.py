from pydantic import BaseModel, Field


class CreateQuerySessionRequest(BaseModel):
    prompt: str = Field(..., min_length=3, max_length=500)
    dataset_id: str = Field(..., min_length=1)
    live_mode: bool = False
    error_tolerance: float = Field(default=0.05, gt=0, le=0.5)
    confidence_level: float = Field(default=0.95, gt=0, lt=1)


class CreateQuerySessionResponse(BaseModel):
    session_id: str
