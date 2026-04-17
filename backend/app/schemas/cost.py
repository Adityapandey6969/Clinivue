from typing import List, Optional
from pydantic import BaseModel
from .intent import ConfidenceEnvelope

class CostComponent(BaseModel):
    name: str
    min_inr: int
    max_inr: int

class RangeInr(BaseModel):
    min: int
    max: int

class CostEstimateRequest(BaseModel):
    procedure: str
    city: str
    age: Optional[int] = None
    comorbidities: Optional[List[str]] = None

class CostEstimateResponse(BaseModel):
    components: List[CostComponent]
    total_range_inr: RangeInr
    confidence: ConfidenceEnvelope
    disclaimer: str
