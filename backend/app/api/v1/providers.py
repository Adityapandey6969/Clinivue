from fastapi import APIRouter
from app.schemas.provider import ProviderRequest, ProviderListResponse, ProviderOutput, ScoreBreakdown
from app.schemas.intent import ConfidenceEnvelope
import random

router = APIRouter()

def _mock_hospitals(location: str):
    return [
        {
            "hospital_id": "hosp_042",
            "name": f"Care Hospital {location}",
            "city": location,
            "nabh_accredited": True,
            "price_tier": "mid",
            "contact": "+91-712-XXXXXXX",
            "why": f"Strong cardiac unit (NABH-accredited), {random.uniform(1.0, 10.0):.1f} km away, mid-range pricing."
        },
        {
            "hospital_id": "hosp_043",
            "name": f"Apex Heart Institute {location}",
            "city": location,
            "nabh_accredited": True,
            "price_tier": "premium",
            "contact": "+91-712-YYYYYYY",
            "why": f"Highly rated specialist facility, {random.uniform(1.0, 10.0):.1f} km away, premium pricing."
        },
        {
            "hospital_id": "hosp_044",
            "name": f"City Multi-speciality {location}",
            "city": location,
            "nabh_accredited": False,
            "price_tier": "budget",
            "contact": "+91-712-ZZZZZZZ",
            "why": f"Affordable option for standard procedures, {random.uniform(1.0, 10.0):.1f} km away."
        }
    ]

@router.post("/", response_model=ProviderListResponse)
def get_providers(request: ProviderRequest):
    # Mock Clinical Mapping and Ranking for Day 1 MVP
    hospitals = _mock_hospitals(request.location)
    providers = []
    
    for i, h in enumerate(hospitals):
        score = 0.90 - (i * 0.05)
        providers.append(
            ProviderOutput(
                hospital_id=h["hospital_id"],
                name=h["name"],
                city=h["city"],
                rank=i+1,
                score=score,
                score_breakdown=ScoreBreakdown(
                    clinical_match=0.92,
                    reputation=0.78,
                    distance_km=4.2,
                    affordability=0.74,
                    capacity=0.60
                ),
                nabh_accredited=h["nabh_accredited"],
                price_tier=h["price_tier"],
                why_this_hospital=h["why"],
                contact=h["contact"]
            )
        )
        
    return ProviderListResponse(
        providers=providers,
        confidence=ConfidenceEnvelope(
            confidence_score=0.81,
            risk_flags=["demo_mock_data"],
            assumptions=["Distance is estimated"]
        )
    )
