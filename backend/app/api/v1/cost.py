from fastapi import APIRouter
from app.schemas.cost import CostEstimateRequest, CostEstimateResponse, CostComponent, RangeInr
from app.schemas.intent import ConfidenceEnvelope

router = APIRouter()

@router.post("/", response_model=CostEstimateResponse)
def get_cost_estimate(request: CostEstimateRequest):
    # Rule-based generation (mock logic)
    # The PDR requires componentized arrays
    
    comp_list = [
        CostComponent(name="Procedure fee", min_inr=80000, max_inr=120000),
        CostComponent(name="Hospital stay", min_inr=15000, max_inr=40000),
        CostComponent(name="Doctor fees", min_inr=6000, max_inr=18000),
        CostComponent(name="Diagnostics", min_inr=4000, max_inr=12000),
        CostComponent(name="Medicines", min_inr=5000, max_inr=20000),
    ]
    
    # Simple comorbidity adjustment logic
    buffer_min = 22000
    buffer_max = 42000
    risk_flags = []
    
    if request.comorbidities:
        buffer_min += 5000
        buffer_max += 10000
        risk_flags.append("comorbidity_cost_adjustment_applied")
        
    comp_list.append(CostComponent(name="Contingency (20%)", min_inr=buffer_min, max_inr=buffer_max))

    total_min = sum(c.min_inr for c in comp_list)
    total_max = sum(c.max_inr for c in comp_list)

    return CostEstimateResponse(
        components=comp_list,
        total_range_inr=RangeInr(min=total_min, max=total_max),
        confidence=ConfidenceEnvelope(
            confidence_score=0.74,
            risk_flags=risk_flags,
            assumptions=["Based on general ward pricing", "Generic medicines assumed"]
        ),
        disclaimer="This is decision-support information, not medical advice."
    )
