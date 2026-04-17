from typing import List, Optional
from pydantic import BaseModel
from .intent import ConfidenceEnvelope

class ScoreBreakdown(BaseModel):
    clinical_match: float
    reputation: float
    distance_km: float
    affordability: float
    capacity: float

class ProviderOutput(BaseModel):
    hospital_id: str
    name: str
    city: str
    rank: int
    score: float
    score_breakdown: ScoreBreakdown
    nabh_accredited: bool
    price_tier: str
    why_this_hospital: str
    contact: str

class ProviderRequest(BaseModel):
    procedure: str
    location: str
    budget_inr: Optional[int] = None

class ProviderListResponse(BaseModel):
    providers: List[ProviderOutput]
    confidence: ConfidenceEnvelope
