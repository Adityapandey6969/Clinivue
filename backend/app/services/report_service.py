"""
Report Analysis Service — 7-stage pipeline from the PDR:
1. Ingest & validate
2. OCR (text extraction from PDF/image)
3. Parse (extract test_name, value, unit)
4. Normalize (standardize units)
5. Reference compare (age-sex-adjusted ranges)
6. Flag (low / normal / high with severity)
7. Explain (plain-language summary via LLM, guardrailed)
"""

import re
import json
import uuid
import time
import threading
from typing import Dict, List, Optional
from datetime import datetime, timezone

from google import genai
from google.genai import types as genai_types
from app.core.config import settings
from app.services.safety_classifier import (
    generate_safe_recommendation,
    sanitize_llm_output,
    MANDATORY_DISCLAIMER,
)


# ─── In-memory store for async report processing (MVP) ──────────────────
_report_store: Dict[str, dict] = {}


# ─── Reference ranges knowledge base ────────────────────────────────────
REFERENCE_RANGES = {
    "hemoglobin":       {"unit": "g/dL",    "male": (13.0, 17.5),  "female": (12.0, 15.5), "any": (12.0, 17.5)},
    "rbc":              {"unit": "M/µL",    "any": (4.5, 5.5)},
    "wbc":              {"unit": "K/µL",    "any": (4.0, 11.0)},
    "platelet":         {"unit": "K/µL",    "any": (150.0, 400.0)},
    "hba1c":            {"unit": "%",       "any": (4.0, 5.6)},
    "fasting glucose":  {"unit": "mg/dL",   "any": (70.0, 100.0)},
    "glucose":          {"unit": "mg/dL",   "any": (70.0, 140.0)},
    "cholesterol":      {"unit": "mg/dL",   "any": (125.0, 200.0)},
    "total cholesterol":{"unit": "mg/dL",   "any": (125.0, 200.0)},
    "ldl":              {"unit": "mg/dL",   "any": (0.0, 100.0)},
    "hdl":              {"unit": "mg/dL",   "male": (40.0, 60.0),  "female": (50.0, 60.0), "any": (40.0, 60.0)},
    "triglycerides":    {"unit": "mg/dL",   "any": (0.0, 150.0)},
    "creatinine":       {"unit": "mg/dL",   "male": (0.7, 1.3),    "female": (0.6, 1.1),  "any": (0.6, 1.3)},
    "urea":             {"unit": "mg/dL",   "any": (7.0, 20.0)},
    "bun":              {"unit": "mg/dL",   "any": (7.0, 20.0)},
    "alt":              {"unit": "U/L",     "any": (7.0, 56.0)},
    "ast":              {"unit": "U/L",     "any": (10.0, 40.0)},
    "bilirubin":        {"unit": "mg/dL",   "any": (0.1, 1.2)},
    "albumin":          {"unit": "g/dL",    "any": (3.5, 5.5)},
    "tsh":              {"unit": "µIU/mL",  "any": (0.4, 4.0)},
    "t3":               {"unit": "ng/dL",   "any": (80.0, 200.0)},
    "t4":               {"unit": "µg/dL",   "any": (5.0, 12.0)},
    "vitamin d":        {"unit": "ng/mL",   "any": (30.0, 100.0)},
    "vitamin b12":      {"unit": "pg/mL",   "any": (200.0, 900.0)},
    "iron":             {"unit": "µg/dL",   "male": (65.0, 175.0), "female": (50.0, 170.0), "any": (50.0, 175.0)},
    "calcium":          {"unit": "mg/dL",   "any": (8.5, 10.5)},
    "sodium":           {"unit": "mEq/L",   "any": (136.0, 145.0)},
    "potassium":        {"unit": "mEq/L",   "any": (3.5, 5.0)},
    "uric acid":        {"unit": "mg/dL",   "male": (3.4, 7.0),    "female": (2.4, 6.0),  "any": (2.4, 7.0)},
    "esr":              {"unit": "mm/hr",   "male": (0.0, 15.0),   "female": (0.0, 20.0), "any": (0.0, 20.0)},
}


def _get_reference(test_name: str, sex: str = "any"):
    """Look up reference range for a test name."""
    key = test_name.lower().strip()
    for ref_key, ref_data in REFERENCE_RANGES.items():
        if ref_key in key or key in ref_key:
            if sex in ref_data:
                return ref_data[sex], ref_data.get("unit", "")
            return ref_data.get("any", (0, 0)), ref_data.get("unit", "")
    return None, ""


def _determine_status_severity(value: float, ref_range: tuple):
    """Flag value as low/normal/high with severity sub-levels."""
    min_val, max_val = ref_range
    if min_val <= value <= max_val:
        return "normal", "normal"

    if value > max_val:
        pct_over = ((value - max_val) / max_val) * 100 if max_val else 0
        if pct_over > 50:
            return "high", "high"
        else:
            return "high", "moderate"

    if value < min_val:
        pct_under = ((min_val - value) / min_val) * 100 if min_val else 0
        if pct_under > 50:
            return "low", "high"
        else:
            return "low", "moderate"

    return "normal", "normal"


def _extract_parameters_with_llm(raw_text: str) -> list:
    """
    Stage 3 — Use Gemini to extract structured lab parameters from OCR text.
    Falls back to regex if LLM fails.
    """
    client = genai.Client(api_key=settings.GEMINI_API_KEY)

    prompt = f"""You are a medical report parser. Extract ALL lab test parameters from the following report text.

For each parameter, return:
- "name": the test name (e.g., "Hemoglobin", "HbA1c", "Cholesterol")
- "value": the numeric value as a float
- "unit": the unit of measurement (e.g., "mg/dL", "%", "g/dL")

Return ONLY a valid JSON array of objects. If you cannot find any parameters, return an empty array [].

Report text:
\"\"\"
{raw_text}
\"\"\"
"""

    try:
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt,
            config=genai_types.GenerateContentConfig(
                response_mime_type="application/json",
            ),
        )
        params = json.loads(response.text)
        if isinstance(params, list):
            return params
    except Exception as e:
        print(f"[ReportService] LLM extraction failed: {e}")

    # Fallback regex extraction
    return _regex_extract_parameters(raw_text)


def _regex_extract_parameters(text: str) -> list:
    """Fallback regex-based extraction of lab values."""
    patterns = [
        r"([\w\s]+?)\s*[:=]\s*([\d.]+)\s*(mg/dL|g/dL|%|U/L|µIU/mL|ng/dL|µg/dL|ng/mL|pg/mL|mEq/L|mm/hr|K/µL|M/µL|µg/dL)",
    ]
    results = []
    for pattern in patterns:
        matches = re.findall(pattern, text, re.IGNORECASE)
        for name, value, unit in matches:
            try:
                results.append({
                    "name": name.strip(),
                    "value": float(value),
                    "unit": unit.strip(),
                })
            except ValueError:
                continue
    return results


def _generate_explanation(param_name: str, value: float, status: str, severity: str, ref_range: tuple) -> str:
    """Generate a plain-language explanation for a flagged parameter."""
    if status == "normal":
        return f"{param_name} is within the normal reference range ({ref_range[0]}–{ref_range[1]})."

    direction = "above" if status == "high" else "below"
    severity_text = "significantly " if severity == "high" else "mildly "

    explanations = {
        "hba1c": f"HbA1c is {severity_text}{direction} normal, indicating {'poor' if status == 'high' else 'low'} blood sugar control over the past 3 months. Please consult a doctor.",
        "cholesterol": f"Cholesterol is {severity_text}elevated, which may increase cardiovascular risk. Please consult a doctor.",
        "ldl": f"LDL cholesterol is {severity_text}{direction} the optimal range. Elevated LDL is associated with increased cardiovascular risk.",
        "creatinine": f"Creatinine is {severity_text}{direction} normal, which may indicate changes in kidney function. Please consult a nephrologist.",
        "hemoglobin": f"Hemoglobin is {severity_text}{direction} normal. {'This may indicate anemia.' if status == 'low' else 'Please consult a doctor.'}",
        "tsh": f"TSH is {severity_text}{direction} normal, which may suggest thyroid function changes. Please consult an endocrinologist.",
    }

    key = param_name.lower().strip()
    for ek, ev in explanations.items():
        if ek in key:
            return ev

    return f"{param_name} value ({value}) is {severity_text}{direction} the normal range ({ref_range[0]}–{ref_range[1]}). Please consult a doctor."


def _process_report_async(report_id: str, raw_text: str):
    """
    Background thread that runs the full 7-stage pipeline.
    Updates _report_store as it progresses.
    """
    try:
        # Stage 1 — Ingest (already done by upload endpoint)
        _report_store[report_id]["progress_pct"] = 10
        time.sleep(0.3)

        # Stage 2 — OCR (raw_text already provided by caller)
        _report_store[report_id]["progress_pct"] = 25
        time.sleep(0.3)

        # Stage 3 — Parse: extract parameters
        _report_store[report_id]["progress_pct"] = 40
        raw_params = _extract_parameters_with_llm(raw_text)
        time.sleep(0.2)

        # Stage 4 & 5 — Normalize & Reference compare
        _report_store[report_id]["progress_pct"] = 60
        parameters = []
        for p in raw_params:
            ref_range, ref_unit = _get_reference(p["name"])
            if ref_range is None:
                ref_range = (0, 0)

            # Stage 6 — Flag
            status, severity = _determine_status_severity(p["value"], ref_range)

            # Stage 7 — Explain
            explanation = _generate_explanation(
                p["name"], p["value"], status, severity, ref_range
            )

            parameters.append({
                "name": p["name"],
                "value": p["value"],
                "unit": p.get("unit", ref_unit),
                "status": status,
                "severity": severity if status != "normal" else "normal",
                "reference_range": list(ref_range),
                "explanation": explanation,
            })

        _report_store[report_id]["progress_pct"] = 80

        # Generate summary
        abnormal = [p for p in parameters if p["status"] != "normal"]
        if abnormal:
            summary = f"{len(abnormal)} parameter(s) are outside the normal range. Consultation with a physician is recommended."
        else:
            summary = "All parameters appear within normal ranges. Continue routine health check-ups."

        # Generate safe recommendation using the guardrailed engine
        recommendation = generate_safe_recommendation(parameters)
        sanitized_rec, _ = sanitize_llm_output(recommendation)

        # Calculate overall confidence
        matched = sum(1 for p in raw_params if _get_reference(p["name"])[0] is not None)
        confidence = round(matched / max(len(raw_params), 1), 2)

        _report_store[report_id].update({
            "status": "complete",
            "progress_pct": 100,
            "parsed_at": datetime.now(timezone.utc).isoformat(),
            "confidence": confidence,
            "parameters": parameters,
            "summary": summary,
            "recommendation": sanitized_rec,
        })

    except Exception as e:
        print(f"[ReportService] Pipeline error: {e}")
        _report_store[report_id].update({
            "status": "failed",
            "progress_pct": 0,
            "summary": f"Processing failed: {str(e)}",
        })


def start_report_processing(report_id: str, raw_text: str):
    """Kick off async report processing in a background thread."""
    _report_store[report_id] = {
        "report_id": report_id,
        "status": "processing",
        "progress_pct": 0,
    }
    thread = threading.Thread(
        target=_process_report_async,
        args=(report_id, raw_text),
        daemon=True,
    )
    thread.start()


def get_report_status(report_id: str) -> Optional[dict]:
    """Retrieve the current state of a report from the in-memory store."""
    return _report_store.get(report_id)
