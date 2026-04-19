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
import io
import base64
import pypdf
import subprocess
import os
import sys
import tempfile
import requests
from typing import Dict, List, Optional
from datetime import datetime, timezone

from google import genai
from google.genai import types as genai_types
from groq import Groq
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


def _determine_status_severity(value, ref_range: tuple):
    """Flag value as low/normal/high with severity sub-levels."""
    if isinstance(value, str):
        # We cannot numerically compare string results (like "Nil", "Clear", "Absent")
        return "normal", "normal"

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


def _ocr_space_extract(file_bytes: bytes, mime_type: str) -> str:
    """
    Use OCR.space free API to extract text from an image or PDF.
    Tries Engine 2 first (better for documents), then falls back to Engine 1.
    For PDFs, uses file upload approach and combines text from all pages.
    Works cross-platform (Windows, Mac, Linux).
    """
    api_key = settings.OCR_SPACE_API_KEY
    if not api_key:
        print("[OCR.space] No API key configured, skipping.")
        return ""

    file_size_mb = len(file_bytes) / (1024 * 1024)
    print(f"[OCR.space] Processing {file_size_mb:.1f} MB file ({mime_type})...")

    # Free tier limit is 1MB — warn but still try
    if file_size_mb > 1.0:
        print(f"[OCR.space] Warning: File is {file_size_mb:.1f} MB (free tier limit is 1 MB). Will attempt anyway...")

    # Determine file extension
    ext = "png"
    if "jpeg" in mime_type or "jpg" in mime_type:
        ext = "jpg"
    elif "pdf" in mime_type:
        ext = "pdf"

    is_pdf = "pdf" in mime_type
    
    # Try Engine 1 first for images (better for photos), Engine 2 first for PDFs (better for digital docs)
    engines_to_try = [2, 1] if is_pdf else [1, 2]
    
    for engine in engines_to_try:
        try:
            if is_pdf:
                # For PDFs: use multipart file upload (more reliable than base64)
                files = {
                    "file": (f"report.{ext}", io.BytesIO(file_bytes), mime_type)
                }
                data = {
                    "apikey": api_key,
                    "language": "eng",
                    "isOverlayRequired": False,
                    "OCREngine": engine,
                    "scale": True,
                    "isTable": True,
                    "filetype": "PDF",
                }
                response = requests.post(
                    "https://api.ocr.space/parse/image",
                    files=files,
                    data=data,
                    timeout=90,
                )
            else:
                # For images: use base64 data URI
                b64_data = base64.b64encode(file_bytes).decode("utf-8")
                data_uri = f"data:image/{ext};base64,{b64_data}"
                data = {
                    "apikey": api_key,
                    "base64Image": data_uri,
                    "language": "eng",
                    "isOverlayRequired": False,
                    "OCREngine": engine,
                    "scale": True,
                    "isTable": True,
                }
                response = requests.post(
                    "https://api.ocr.space/parse/image",
                    data=data,
                    timeout=60,
                )

            result = response.json()

            if result.get("IsErroredOnProcessing"):
                err_msgs = result.get('ErrorMessage', ['Unknown'])
                print(f"[OCR.space] Engine {engine} error: {err_msgs}")
                # If file too large, no point trying the other engine
                if any("size" in str(m).lower() or "limit" in str(m).lower() for m in (err_msgs if isinstance(err_msgs, list) else [err_msgs])):
                    print("[OCR.space] File exceeds size limit for free tier.")
                    break
                continue

            # Combine text from ALL pages (important for multi-page PDFs)
            parsed_results = result.get("ParsedResults", [])
            if parsed_results:
                all_text = "\n".join(
                    pr.get("ParsedText", "").strip()
                    for pr in parsed_results
                    if pr.get("ParsedText", "").strip()
                )
                if all_text and len(all_text) > 10:
                    print(f"[OCR.space] Engine {engine} extracted {len(all_text)} chars from {len(parsed_results)} page(s).")
                    print(f"[OCR.space] Preview: {all_text[:200]}...")
                    return all_text
                else:
                    print(f"[OCR.space] Engine {engine} returned too little text ({len(all_text)} chars), trying next engine...")
            else:
                print(f"[OCR.space] Engine {engine} returned no parsed results.")

        except Exception as e:
            print(f"[OCR.space] Engine {engine} failed: {e}")

    print("[OCR.space] All engines failed to extract text.")
    return ""


def _extract_parameters_with_llm(file_bytes: bytes, mime_type: str) -> list:
    """
    Stage 3 — Use Gemini vision/text to extract structured lab parameters from the file.
    """
    client = genai.Client(api_key=settings.GEMINI_API_KEY)

    prompt = f"""You are a medical report parser. Extract ALL lab test parameters from the following report.

For each parameter, return:
- "name": the test name (e.g., "Hemoglobin", "HbA1c", "Cholesterol", "Urine Protein")
- "value": the result value (can be a number like 14.5 or a string like "Nil", "Absent")
- "unit": the unit of measurement (e.g., "mg/dL", "%", "g/dL")

Return ONLY a valid JSON array of objects. If you cannot find any parameters, return an empty array [].
"""

    # --- Stage 3.1: Try Gemini (multimodal) with quick retries ---
    for attempt in range(2):
        try:
            contents = []
            if mime_type.startswith("image/") or mime_type == "application/pdf":
                contents.append(genai_types.Part.from_bytes(data=file_bytes, mime_type=mime_type))
                contents.append(prompt)
            else:
                text_data = file_bytes.decode('utf-8', errors='ignore')
                contents.append(prompt + f"\n\nReport text:\n\"\"\"\n{text_data}\n\"\"\"")

            response = client.models.generate_content(
                model="gemini-2.0-flash",
                contents=contents,
                config=genai_types.GenerateContentConfig(
                    response_mime_type="application/json",
                ),
            )
            params = json.loads(response.text)
            if isinstance(params, list) and len(params) > 0:
                return params
        except Exception as e:
            error_str = str(e)
            if "429" in error_str or "RESOURCE_EXHAUSTED" in error_str:
                wait_time = 5 * (attempt + 1)
                print(f"[ReportService] Gemini rate limited. Waiting {wait_time}s before fallback... (attempt {attempt+1}/2)")
                time.sleep(wait_time)
                continue
            else:
                print(f"[ReportService] Gemini extraction failed: {e}")
                break
    print("[ReportService] Gemini exhausted. Falling through to OCR.space + Groq...")

    # --- Stage 3.2: Try OCR.space + Groq (text-only fallback) ---
    if settings.GROQ_API_KEY:
        print("[ReportService] Attempting OCR.space + Groq fallback...")
        try:
            # For Groq, we MUST extract text locally since it can't "see" files
            text_data = ""

            if mime_type == "application/pdf":
                # Step 1: Try local pypdf extraction (works for digital/text PDFs)
                try:
                    pdf_reader = pypdf.PdfReader(io.BytesIO(file_bytes))
                    text_data = "\n".join([page.extract_text() or "" for page in pdf_reader.pages]).strip()
                    print(f"[ReportService] pypdf extracted: {len(text_data)} chars")
                except Exception as pdf_err:
                    print(f"[ReportService] pypdf failed: {pdf_err}")

                # Step 2: If pypdf got very little text, it's likely a scanned PDF → use OCR.space
                if len(text_data) < 50:
                    print("[ReportService] pypdf returned insufficient text. Trying OCR.space for scanned PDF...")
                    ocr_text = _ocr_space_extract(file_bytes, mime_type)
                    if ocr_text and len(ocr_text) > len(text_data):
                        text_data = ocr_text

            elif mime_type.startswith("image/"):
                # Use OCR.space for cross-platform image text extraction
                text_data = _ocr_space_extract(file_bytes, mime_type)
                if not text_data:
                    # Last resort: try native macOS OCR if on darwin
                    if sys.platform == "darwin":
                        try:
                            print("[ReportService] Attempting native macOS OCR for image...")
                            with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
                                tmp.write(file_bytes)
                                tmp_path = tmp.name
                            swift_path = os.path.join(os.path.dirname(__file__), "..", "utils", "ocr.swift")
                            result = subprocess.run(["swift", swift_path, tmp_path], capture_output=True, text=True)
                            text_data = result.stdout.strip()
                            os.unlink(tmp_path)
                            if text_data:
                                print(f"[ReportService] Local OCR successful. Extracted {len(text_data)} characters.")
                        except Exception as ocr_err:
                            print(f"[ReportService] Native OCR bridge failed: {ocr_err}")
            else:
                text_data = file_bytes.decode('utf-8', errors='ignore')

            if text_data:
                print(f"[ReportService] Sending {len(text_data)} chars to Groq for parameter extraction...")
                groq_prompt = f"""You are an expert medical lab report parser. Your goal is to carefully extract ALL laboratory test results from the noisy OCR text below.
The text is from a scanned document, so it may contain typos, poor formatting, misaligned rows, or fragmented lines. You must intelligently piece together the test names, their numeric results, and units.

For EACH parameter you find, return a JSON object with:
- "name": the test name exactly as written (e.g., "Sr. Uric Acid", "Colour", "Deposits")
- "value": the result value (can be a number like 6.74 or a string like "Nil", "Pale Yellow")
- "unit": the unit of measurement (e.g., "mg/dL", "IU/ml", "g/dL")

CRITICAL INSTRUCTIONS:
1. Do NOT skip any parameters. Read the entire text block carefully.
2. If the text is messy, look for numbers or strings (like "Nil", "Absent") that follow common test names.
3. Return ONLY a valid JSON array and absolutely no other text. Example: [{{"name": "Urine Protein", "value": "Nil", "unit": "Absent"}}]

HERE IS THE OCR REPORT TEXT:
\"\"\"
{text_data}
\"\"\""""
                
                groq_client = Groq(api_key=settings.GROQ_API_KEY)
                groq_response = groq_client.chat.completions.create(
                    model="llama-3.3-70b-versatile",
                    messages=[{"role": "system", "content": "You are a medical report data extractor. Output ONLY valid JSON arrays, no markdown, no explanation."}, 
                              {"role": "user", "content": groq_prompt}],
                    temperature=0.1,
                )
                groq_text = groq_response.choices[0].message.content
                print(f"[ReportService] Groq raw response: {groq_text[:300]}")
                start_idx = groq_text.find('[')
                end_idx = groq_text.rfind(']')
                if start_idx != -1 and end_idx != -1:
                    groq_data = json.loads(groq_text[start_idx:end_idx+1])
                    if isinstance(groq_data, list) and len(groq_data) > 0:
                        print(f"[ReportService] Groq extracted {len(groq_data)} parameters successfully!")
                        return groq_data
                    else:
                        print("[ReportService] Groq returned empty parameter list.")
                else:
                    print("[ReportService] Groq response did not contain a JSON array.")
            else:
                print("[ReportService] No text could be extracted from the file. All OCR methods failed.")

        except Exception as groq_err:
            print(f"[ReportService] Groq fallback failed: {groq_err}")
    else:
        print("[ReportService] No GROQ_API_KEY configured, skipping fallback.")

    # If everything fails, return an empty list
    print("[ReportService] ALL extraction methods failed. Returning empty parameters.")
    return []


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


def _process_report_async(report_id: str, file_bytes: bytes, mime_type: str):
    """
    Background thread that runs the full 7-stage pipeline.
    Updates _report_store as it progresses.
    """
    try:
        # Check for cancellation at each stage
        def _is_cancelled():
            return _report_store.get(report_id, {}).get("status") == "cancelled"

        # Stage 1 & 2 — Ingest (already done by upload endpoint)
        _report_store[report_id]["progress_pct"] = 10
        time.sleep(0.2)
        if _is_cancelled(): return

        # Stage 3 — Parse: extract parameters
        _report_store[report_id]["progress_pct"] = 40
        raw_params = _extract_parameters_with_llm(file_bytes, mime_type)
        if _is_cancelled(): return
        
        # Final Rule-based Fallback if AI finds nothing
        if not raw_params:
            print("[ReportService] AI found no parameters. Attempting regex fallback.")
            try:
                text_data = ""
                if mime_type == "application/pdf":
                    pdf_reader = pypdf.PdfReader(io.BytesIO(file_bytes))
                    text_data = "".join([page.extract_text() for page in pdf_reader.pages])
                else:
                    text_data = file_bytes.decode('utf-8', errors='ignore')
                
                if text_data:
                    raw_params = _regex_extract_parameters(text_data)
            except Exception as e:
                print(f"[ReportService] Regex fallback failed: {e}")
        
        time.sleep(0.2)

        # Stage 4 & 5 — Normalize & Reference compare
        _report_store[report_id]["progress_pct"] = 60
        parameters = []
        for p in raw_params:
            # Skip invalid parameters returned by LLM (e.g. null values)
            val = p.get("value")
            if val is None:
                continue
            
            try:
                p["value"] = float(val)
            except (ValueError, TypeError):
                # Keep as string for non-numeric results (like 'Nil', 'Clear')
                p["value"] = str(val).strip()
                
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
        rec_data = generate_safe_recommendation(parameters)
        sanitized_rec, _ = sanitize_llm_output(rec_data["recommendation_text"])

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
            "home_remedies": rec_data.get("home_remedies", []),
            "action_plan": rec_data.get("action_plan", []),
            "health_risks": rec_data.get("health_risks", []),
        })

    except Exception as e:
        print(f"[ReportService] Pipeline error: {e}")
        _report_store[report_id].update({
            "status": "failed",
            "progress_pct": 0,
            "summary": f"Processing failed: {str(e)}",
        })


def start_report_processing(report_id: str, file_bytes: bytes, mime_type: str):
    """Kick off async report processing in a background thread."""
    _report_store[report_id] = {
        "report_id": report_id,
        "status": "processing",
        "progress_pct": 0,
    }
    thread = threading.Thread(
        target=_process_report_async,
        args=(report_id, file_bytes, mime_type),
        daemon=True,
    )
    thread.start()


def get_report_status(report_id: str) -> Optional[dict]:
    """Retrieve the current state of a report from the in-memory store."""
    return _report_store.get(report_id)


def cancel_report(report_id: str) -> bool:
    """Cancel an in-progress report. Returns True if cancelled, False if not found/already done."""
    report = _report_store.get(report_id)
    if report is None:
        return False
    if report["status"] in ("complete", "failed", "cancelled"):
        return False
    report["status"] = "cancelled"
    report["progress_pct"] = 0
    report["summary"] = "Analysis cancelled by user."
    print(f"[ReportService] Report {report_id} cancelled by user.")
    return True
