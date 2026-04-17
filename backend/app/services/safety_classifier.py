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
    Produces: specialty routing, lifestyle suggestions, Ayurveda/home remedies,
    and 'when to consult' triggers.
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

    # ─── Ayurveda & Home Remedies ────────────────────────────────────────
    abnormal = high_severity + moderate_severity + low_severity
    if abnormal:
        remedies = _get_ayurveda_remedies(abnormal)
        if remedies:
            remedy_lines = "\n".join(f"  • {r}" for r in remedies)
            parts.append(
                f"🌿 **Traditional & Home Remedies**\n"
                f"These are well-known Ayurvedic and home wellness practices that may support your health:\n\n"
                f"{remedy_lines}\n\n"
                f"⚠️ *These are traditional wellness practices, not substitutes for medical treatment. "
                f"Consult your doctor before starting any remedy, especially if you are on medication.*"
            )

    if not parts:
        parts.append(
            "✅ All parameters appear within normal ranges. Continue routine health check-ups "
            "as recommended by your physician."
        )

    # Mandatory disclaimer
    parts.append(f"\n⚕️ *{MANDATORY_DISCLAIMER}*")

    return "\n\n".join(parts)


# ─── Ayurveda & Home Remedy Knowledge Base ───────────────────────────────
AYURVEDA_REMEDIES = {
    # Blood sugar related
    "hba1c": [
        "🫚 **Fenugreek (Methi):** Soak 1 tbsp methi seeds overnight, drink the water on an empty stomach",
        "🥒 **Bitter Gourd (Karela):** A small glass of karela juice in the morning may help manage blood sugar",
        "🍵 **Cinnamon (Dalchini):** Add ½ tsp cinnamon powder to warm water or tea daily",
        "🌿 **Turmeric (Haldi):** Golden milk — warm milk with ½ tsp turmeric before bed",
        "🌱 **Jamun seeds:** Dried jamun seed powder (1 tsp with water) is traditionally used for sugar control",
    ],
    "glucose": [
        "🫚 **Fenugreek water:** Soak methi seeds overnight, strain and drink morning water",
        "🥒 **Bitter gourd juice:** Small quantity on empty stomach",
        "🌿 **Neem leaves:** Chew 4-5 fresh neem leaves in the morning",
        "🍵 **Cinnamon tea:** Steep ½ tsp dalchini in hot water for 10 minutes",
    ],
    # Cholesterol related
    "cholesterol": [
        "🧄 **Garlic (Lahsun):** 1-2 raw cloves on an empty stomach may support heart health",
        "🌿 **Flaxseeds (Alsi):** 1 tbsp ground flaxseed daily — rich in omega-3",
        "🍵 **Green tea:** 2-3 cups daily — contains catechins that may help lower LDL",
        "🫒 **Amla (Indian gooseberry):** 1 tsp amla powder with warm water daily",
        "🥜 **Walnuts & Almonds:** A handful (5-6 pieces) soaked overnight",
    ],
    "ldl": [
        "🧄 **Garlic:** 2 raw cloves with warm water on an empty stomach",
        "🍵 **Arjuna bark tea:** Arjun ki chhal tea is traditionally used for heart health",
        "🫒 **Amla juice:** 20ml fresh amla juice daily",
        "🌿 **Psyllium husk (Isabgol):** 1 tsp in water before meals — soluble fiber helps lower LDL",
    ],
    "hdl": [
        "🫒 **Coconut oil:** Use virgin coconut oil for cooking — may raise good HDL",
        "🥜 **Nuts:** Almonds, walnuts — a handful daily",
        "🏃 **Regular exercise:** 30 min brisk walking daily is the most effective HDL booster",
    ],
    "triglycerides": [
        "🐟 **Omega-3 rich foods:** Flaxseeds, walnuts, chia seeds",
        "🍵 **Green tea:** 2-3 cups daily",
        "🧄 **Raw garlic:** 1-2 cloves on an empty stomach",
        "🍋 **Lemon water:** Warm lemon water in the morning",
    ],
    # Hemoglobin / Anemia
    "hemoglobin": [
        "🥬 **Beetroot & Spinach juice:** Mix equal parts — a powerful natural iron booster",
        "🫒 **Amla + Jaggery (Gur):** Amla with gur is a traditional remedy for anemia",
        "🍯 **Dates (Khajoor):** 3-4 soaked dates with milk daily",
        "🥜 **Black sesame (Til):** 1 tsp soaked til seeds — rich in iron",
        "🍵 **Nettle tea:** Helps with iron absorption",
        "🌿 **Moringa (Drumstick leaves):** Very rich in iron — add to dal or soup",
    ],
    # Kidney related
    "creatinine": [
        "🌿 **Punarnava (Boerhavia diffusa):** Traditional Ayurvedic herb for kidney health — available as powder or tea",
        "🍵 **Gokshura (Tribulus):** Used in Ayurveda for urinary and kidney support",
        "🥒 **Cucumber & Bottle gourd juice (Lauki):** Natural diuretic",
        "💧 **Stay well hydrated:** 8-10 glasses of water daily",
    ],
    "urea": [
        "💧 **Increase water intake:** Helps kidneys flush out urea",
        "🥒 **Bottle gourd (Lauki) juice:** Natural kidney support",
        "🌿 **Varun bark (Crataeva nurvala):** Ayurvedic kidney tonic",
    ],
    # Liver related
    "alt": [
        "🌿 **Milk Thistle (Silymarin):** Widely used liver-support herb",
        "🍋 **Warm lemon water:** First thing in the morning for liver detox",
        "🫒 **Amla:** Indian gooseberry is a potent liver protectant in Ayurveda",
        "🌿 **Kutki (Picrorhiza kurroa):** Traditional Ayurvedic liver herb",
    ],
    "ast": [
        "🌿 **Bhumi Amla (Phyllanthus niruri):** Used in Ayurveda for liver protection",
        "🍵 **Dandelion tea:** May support liver function",
        "🍋 **Lemon + warm water:** Morning liver flush",
    ],
    "bilirubin": [
        "🍋 **Lemon juice:** May help reduce bilirubin naturally",
        "🌿 **Bhumi Amla:** Ayurvedic herb for jaundice and liver health",
        "🥕 **Carrot + beetroot juice:** Supports liver and blood purification",
    ],
    # Thyroid
    "tsh": [
        "🌿 **Ashwagandha:** Adaptogen that may support thyroid function — consult doctor for dosage",
        "🥜 **Brazil nuts:** Rich in selenium, essential for thyroid hormone conversion",
        "🥒 **Coconut oil:** 1 tsp virgin coconut oil daily",
        "🌿 **Kanchanar Guggulu:** Classical Ayurvedic preparation for thyroid support",
    ],
    # Uric acid
    "uric acid": [
        "🍒 **Cherry juice:** May help reduce uric acid levels naturally",
        "🍋 **Lemon water:** Alkalizing effect may help flush uric acid",
        "🌿 **Giloy (Guduchi):** Ayurvedic herb that may help regulate uric acid",
        "🍵 **Apple cider vinegar:** 1 tsp in a glass of water before meals",
        "🚫 **Reduce:** Red meat, organ meats, alcohol, and high-purine foods",
    ],
    # Vitamin deficiencies
    "vitamin d": [
        "☀️ **Morning sunlight:** 15-20 minutes of sun exposure (before 10 AM)",
        "🥛 **Fortified milk & paneer:** Include dairy in diet",
        "🍄 **Mushrooms:** One of the few plant sources of Vitamin D",
    ],
    "vitamin b12": [
        "🥛 **Milk, curd, paneer:** Rich in B12 for vegetarians",
        "🍳 **Eggs:** One of the best B12 sources",
        "🌿 **Spirulina:** May contain B12 analogs (consult doctor)",
    ],
    # Iron
    "iron": [
        "🥬 **Spinach (Palak):** Cook in iron kadhai for extra iron",
        "🫒 **Jaggery (Gur):** Replace sugar with gur",
        "🍋 **Vitamin C with iron foods:** Squeeze lemon on iron-rich foods for better absorption",
        "🍯 **Dates + milk:** 3-4 dates soaked in warm milk",
    ],
    # Calcium
    "calcium": [
        "🥛 **Milk, curd, paneer:** Traditional calcium-rich Indian foods",
        "🌿 **Ragi (finger millet):** Extremely rich in calcium — make ragi dosa or porridge",
        "🥬 **Sesame seeds (Til):** 1 tbsp daily — very high in calcium",
        "☀️ **Sunlight:** Vitamin D helps calcium absorption",
    ],
    # Electrolytes
    "potassium": [
        "🍌 **Banana:** 1-2 bananas daily — excellent potassium source",
        "🥒 **Coconut water (Nariyal pani):** Natural electrolyte",
        "🥬 **Spinach & sweet potatoes:** Rich in potassium",
    ],
}


def _get_ayurveda_remedies(abnormal_params: list) -> list:
    """Map abnormal parameters to relevant Ayurveda/home remedies."""
    remedies = []
    seen_categories = set()

    for p in abnormal_params:
        name_lower = p["name"].lower().strip()

        for key, remedy_list in AYURVEDA_REMEDIES.items():
            if key in name_lower or name_lower in key:
                if key not in seen_categories:
                    seen_categories.add(key)
                    # Add up to 3 remedies per parameter
                    for r in remedy_list[:3]:
                        if r not in remedies:
                            remedies.append(r)

    return remedies[:8]  # Cap at 8 total remedies

