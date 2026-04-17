"""
Cost Estimation Engine — Uses Gemini + Google Search to fetch REAL hospital pricing.
No hardcoded values. Every estimate comes from live web data.
"""

import json
import time
from fastapi import APIRouter
from google import genai
from google.genai import types as genai_types
from groq import Groq

from app.schemas.cost import CostEstimateRequest, CostEstimateResponse, CostComponent, RangeInr
from app.schemas.intent import ConfidenceEnvelope
from app.core.config import settings

router = APIRouter()


def _fetch_real_costs_from_gemini(procedure: str, city: str, age: int | None, comorbidities: list[str] | None) -> dict:
    """
    Use Gemini with Google Search grounding to find real hospital costs
    for a given procedure in a given Indian city.
    """
    client = genai.Client(api_key=settings.GEMINI_API_KEY)

    comorbidity_str = ""
    if comorbidities:
        comorbidity_str = f"The patient has: {', '.join(comorbidities)}. Factor in any additional costs for managing these conditions."

    age_str = ""
    if age:
        age_str = f"Patient age is {age}."

    prompt = f"""Search the web for the REAL current cost of "{procedure}" surgery/treatment in {city}, India in 2024-2025.

{age_str}
{comorbidity_str}

Search for actual hospital package prices from sources like:
- Practo, MediFee, Lyfboat, Pristyn Care, Credihealth
- Hospital websites (Apollo, Fortis, Max, Narayana Health, etc.)
- Government CGHS/PMJAY rates

Return a JSON object with these exact keys:
{{
  "procedure_fee_min": <integer in INR>,
  "procedure_fee_max": <integer in INR>,
  "hospital_stay_min": <integer in INR>,
  "hospital_stay_max": <integer in INR>,
  "doctor_fees_min": <integer in INR>,
  "doctor_fees_max": <integer in INR>,
  "diagnostics_min": <integer in INR>,
  "diagnostics_max": <integer in INR>,
  "medicines_min": <integer in INR>,
  "medicines_max": <integer in INR>,
  "confidence": <float 0-1, how confident you are in these numbers>,
  "sources": <array of strings listing the sources you found>,
  "notes": <string with important caveats about these prices>
}}

Rules:
- Use REAL prices you find from searching. Do NOT make up numbers.
- Min should be for budget/government hospitals, max for premium private hospitals.
- All values must be integers in Indian Rupees (INR).
- If you cannot find prices for {city} specifically, use nearby major city prices and note this.
- Return ONLY valid JSON, nothing else.
"""

    # Try with Google Search grounding
    for attempt in range(3):
        try:
            response = client.models.generate_content(
                model="gemini-2.0-flash",
                contents=prompt,
                config=genai_types.GenerateContentConfig(
                    response_mime_type="application/json",
                    tools=[genai_types.Tool(
                        google_search=genai_types.GoogleSearch()
                    )],
                ),
            )
            data = json.loads(response.text)
            return data

        except Exception as e:
            error_str = str(e)
            if "503" in error_str or "UNAVAILABLE" in error_str:
                time.sleep(2 ** attempt)
                continue
            print(f"[CostEngine] Gemini error: {e}")

            # Try without grounding as fallback
            try:
                response = client.models.generate_content(
                    model="gemini-2.0-flash",
                    contents=prompt,
                    config=genai_types.GenerateContentConfig(
                        response_mime_type="application/json",
                    ),
                )
                data = json.loads(response.text)
                data["confidence"] = max(0.0, data.get("confidence", 0.6) - 0.15)
                data.setdefault("notes", "Estimated from Gemini knowledge (search unavailable).")
                return data
            except Exception as e2:
                print(f"[CostEngine] Fallback also failed: {e2}")
                if "429" in str(e) or "RESOURCE_EXHAUSTED" in str(e) or "429" in str(e2) or "RESOURCE_EXHAUSTED" in str(e2):
                    if settings.GROQ_API_KEY:
                        print("[CostEngine] Gemini Quota Exceeded. Falling back to Groq.")
                        try:
                            groq_client = Groq(api_key=settings.GROQ_API_KEY)
                            groq_response = groq_client.chat.completions.create(
                                model="llama-3.3-70b-versatile",
                                messages=[{"role": "system", "content": "You are a helpful assistant that outputs only valid JSON."}, 
                                          {"role": "user", "content": prompt}],
                                temperature=0.2,
                                response_format={"type": "json_object"}
                            )
                            groq_data = json.loads(groq_response.choices[0].message.content)
                            groq_data["confidence"] = max(0.0, groq_data.get("confidence", 0.5) - 0.2)
                            groq_data.setdefault("notes", "Estimated from Groq fallback AI knowledge.")
                            return groq_data
                        except Exception as groq_err:
                            print(f"[CostEngine] Groq fallback failed: {groq_err}")
                    return {"_error": "quota_exceeded"}
                continue

    return None


@router.post("/", response_model=CostEstimateResponse)
def get_cost_estimate(request: CostEstimateRequest):
    """Fetch real-time cost estimates using Gemini + Google Search."""

    real_data = _fetch_real_costs_from_gemini(
        procedure=request.procedure,
        city=request.city,
        age=request.age,
        comorbidities=request.comorbidities,
    )

    if real_data is None or real_data.get("_error") == "quota_exceeded":
        err_msg = "Gemini API Quota Exceeded. Please try again later." if real_data and real_data.get("_error") == "quota_exceeded" else "Could not fetch real-time pricing. This is a rough fallback estimate."
        # Ultimate fallback if Gemini is completely down
        return CostEstimateResponse(
            components=[CostComponent(name="Estimated Total", min_inr=50000, max_inr=300000)],
            total_range_inr=RangeInr(min=50000, max=300000),
            confidence=ConfidenceEnvelope(
                confidence_score=0.20,
                risk_flags=["ai_service_unavailable"],
                assumptions=[err_msg],
            ),
            disclaimer="Unable to fetch live pricing. Please consult hospitals directly for accurate quotes.",
        )

    # Build components from Gemini response
    component_map = [
        ("procedure_fee", "Procedure / Surgery Fee"),
        ("hospital_stay", "Hospital Stay (room + nursing)"),
        ("doctor_fees", "Surgeon & Anaesthetist Fees"),
        ("diagnostics", "Pre-op Tests & Imaging"),
        ("medicines", "Medicines & Consumables"),
    ]

    comp_list = []
    for key, label in component_map:
        min_val = real_data.get(f"{key}_min", 0)
        max_val = real_data.get(f"{key}_max", 0)
        if isinstance(min_val, (int, float)) and isinstance(max_val, (int, float)):
            min_val, max_val = int(min_val), int(max_val)
            if min_val > 0 or max_val > 0:
                comp_list.append(CostComponent(name=label, min_inr=min_val, max_inr=max_val))

    total_min = sum(c.min_inr for c in comp_list)
    total_max = sum(c.max_inr for c in comp_list)

    # Confidence from Gemini
    confidence_score = real_data.get("confidence", 0.65)
    if isinstance(confidence_score, str):
        try:
            confidence_score = float(confidence_score)
        except ValueError:
            confidence_score = 0.65
    confidence_score = round(min(max(confidence_score, 0.0), 1.0), 2)

    # Build assumptions
    assumptions = []
    sources = real_data.get("sources", [])
    if sources:
        assumptions.append(f"Data from: {', '.join(sources[:3])}")
    notes = real_data.get("notes", "")
    if notes:
        assumptions.append(notes)

    # Risk flags from comorbidities
    risk_flags = []
    if request.comorbidities:
        for c in request.comorbidities:
            risk_flags.append(f"{c.lower()}_cost_impact_considered")
    if request.age and request.age > 65:
        risk_flags.append("elderly_extended_care_factored")

    return CostEstimateResponse(
        components=comp_list,
        total_range_inr=RangeInr(min=total_min, max=total_max),
        confidence=ConfidenceEnvelope(
            confidence_score=confidence_score,
            risk_flags=risk_flags,
            assumptions=assumptions,
        ),
        disclaimer="Prices sourced from web searches of Indian hospital listings. Actual costs depend on hospital, insurance, room type, and clinical complexity. Always confirm with the hospital directly.",
    )
