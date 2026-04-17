from typing import List, Optional
from pydantic import BaseModel

class ConfidenceEnvelope(BaseModel):
    confidence_score: float
    risk_flags: List[str]
    assumptions: List[str]

class ChatRequest(BaseModel):
    message: str
    session_id: str

class IntentOutput(BaseModel):
    condition: Optional[str] = None
    procedure: Optional[str] = None
    location: Optional[str] = None
    budget_inr: Optional[int] = None
    age: Optional[int] = None
    comorbidities: Optional[List[str]] = None
    urgency: Optional[str] = None

class ChatResponse(BaseModel):
    reply: str
    intent: IntentOutput
    suggested_actions: List[str]
    confidence: ConfidenceEnvelope
