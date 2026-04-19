from typing import List, Optional, Union
from pydantic import BaseModel
from datetime import datetime


class ReportParameter(BaseModel):
    name: str
    value: Union[float, str]
    unit: str
    status: str          # "low" | "normal" | "high"
    severity: str        # "low" | "moderate" | "high"
    reference_range: List[float]
    explanation: str


class ReportUploadResponse(BaseModel):
    report_id: str
    status: str          # "processing"
    estimated_seconds: int


class ReportProcessingResponse(BaseModel):
    report_id: str
    status: str          # "processing"
    progress_pct: int


class ReportResult(BaseModel):
    report_id: str
    status: str          # "complete" | "processing" | "failed"
    parsed_at: Optional[str] = None
    confidence: Optional[float] = None
    parameters: Optional[List[ReportParameter]] = None
    summary: Optional[str] = None
    recommendation: Optional[str] = None
    home_remedies: Optional[List[str]] = None
    action_plan: Optional[List[str]] = None
    health_risks: Optional[List[str]] = None
    disclaimer: str = "This is decision-support information, not medical advice. Always consult a qualified healthcare professional."
    progress_pct: Optional[int] = None
