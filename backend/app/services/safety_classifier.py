"""
Safety Classifier — Guardrailed Recommendation Engine

Hard constraints (non-negotiable) from the PDR:
- MUST NOT diagnose a condition
- MUST NOT recommend a specific drug, dosage, or treatment regimen
- MUST NOT make emergency triage claims
- MUST NOT imply certainty about any health outcome
- Restricted verbs: diagnose, prescribe, confirm, treat, cure (and synonyms)
"""

import re
from typing import List, Tuple

# ─── Restricted vocabulary ───────────────────────────────────────────────
RESTRICTED_VERBS = [
    "diagnose", "diagnosed", "diagnosing", "diagnosis",
    "prescribe", "prescribed", "prescribing", "prescription",
    "confirm", "confirmed", "confirming",
    "treat", "treated", "treating", "treatment plan",
    "cure", "cured", "curing",
    "you have", "you are suffering from",
    "you need to take",
    "take this medication",
    "your condition is",
]

EMERGENCY_KEYWORDS = [
    ("chest pain", "shortness of breath"),
    ("sudden vision loss",),
    ("slurred speech",),
    ("severe headache", "sudden"),
    ("loss of consciousness",),
    ("difficulty breathing",),
    ("seizure",),
    ("stroke",),
    ("heart attack",),
]

EMERGENCY_RESPONSE = (
    "⚠️ URGENT: Based on the symptoms described, please call emergency services (112) "
    "or go to the nearest emergency room immediately. Do not wait for online guidance."
)

MANDATORY_DISCLAIMER = (
    "This is decision-support information, not medical advice. "
    "Always consult a qualified healthcare professional."
)


def check_emergency_keywords(text: str) -> bool:
    """Return True if the text contains emergency red-flag keyword combos."""
    text_lower = text.lower()
    for combo in EMERGENCY_KEYWORDS:
        if all(keyword in text_lower for keyword in combo):
            return True
    return False


def scan_restricted_verbs(text: str) -> List[str]:
    """Return list of restricted verbs/phrases found in the text."""
    text_lower = text.lower()
    found = []
    for verb in RESTRICTED_VERBS:
        if verb in text_lower:
            found.append(verb)
    return found


def sanitize_llm_output(text: str) -> Tuple[str, List[str]]:
    """
    Run the safety classifier on an LLM output.
    Returns (sanitized_text, list_of_blocked_phrases).
    If blocked phrases are found, they are redacted and a warning is prepended.
    """
    blocked = scan_restricted_verbs(text)
    sanitized = text
    if blocked:
        for phrase in blocked:
            pattern = re.compile(re.escape(phrase), re.IGNORECASE)
            sanitized = pattern.sub("[REDACTED]", sanitized)
        sanitized = (
            "⚠️ Some content was modified by our safety system to ensure compliance "
            "with medical safety guidelines.\n\n" + sanitized
        )
    return sanitized, blocked


def generate_safe_recommendation(parameters: list) -> str:
    """
    Generate guardrailed recommendations from parsed report parameters.
    Produces: lifestyle suggestions, specialty routing, and 'when to consult' triggers.
    """
    high_severity = [p for p in parameters if p.get("severity") == "high"]
    moderate_severity = [p for p in parameters if p.get("severity") == "moderate"]
    low_severity = [p for p in parameters if p.get("severity") == "low" and p.get("status") != "normal"]

    parts = []

    # "When to consult a doctor" triggers
    if high_severity:
        names = ", ".join(p["name"] for p in high_severity)
        parts.append(
            f"🔴 **Immediate consultation recommended.** The following parameters show "
            f"significantly abnormal values: {names}. Please schedule an appointment with "
            f"the relevant specialist as soon as possible."
        )

    # Specialty routing
    specialties = set()
    for p in high_severity + moderate_severity:
        name_lower = p["name"].lower()
        if any(k in name_lower for k in ["hba1c", "glucose", "sugar", "insulin"]):
            specialties.add("Endocrinologist")
        elif any(k in name_lower for k in ["cholesterol", "ldl", "hdl", "triglyceride"]):
            specialties.add("Cardiologist")
        elif any(k in name_lower for k in ["creatinine", "urea", "bun", "egfr"]):
            specialties.add("Nephrologist")
        elif any(k in name_lower for k in ["hemoglobin", "rbc", "wbc", "platelet"]):
            specialties.add("Hematologist")
        elif any(k in name_lower for k in ["tsh", "t3", "t4", "thyroid"]):
            specialties.add("Endocrinologist")
        elif any(k in name_lower for k in ["alt", "ast", "bilirubin", "albumin"]):
            specialties.add("Hepatologist / Gastroenterologist")

    if specialties:
        parts.append(
            f"🏥 **Suggested specialties:** {', '.join(sorted(specialties))}."
        )

    # Lifestyle suggestions (safe, non-prescriptive)
    if moderate_severity or low_severity:
        parts.append(
            "💡 **General wellness suggestions:** Consider maintaining a balanced diet, "
            "regular physical activity, adequate hydration, and sufficient sleep. "
            "These are general lifestyle suggestions and not specific medical advice."
        )

    if not parts:
        parts.append(
            "✅ All parameters appear within normal ranges. Continue routine health check-ups "
            "as recommended by your physician."
        )

    # Mandatory disclaimer
    parts.append(f"\n⚕️ *{MANDATORY_DISCLAIMER}*")

    return "\n\n".join(parts)
