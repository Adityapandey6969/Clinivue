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
import json
from typing import List, Tuple, Dict
from google import genai
from google.genai import types as genai_types
from app.core.config import settings

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


def generate_safe_recommendation(parameters: list) -> Dict[str, any]:
    """
    Generate guardrailed recommendations from parsed report parameters.
    Returns a dictionary with structured insights.
    """
    high_severity = [p for p in parameters if p.get("severity") == "high"]
    moderate_severity = [p for p in parameters if p.get("severity") == "moderate"]
    low_severity = [p for p in parameters if p.get("severity") == "low" and p.get("status") != "normal"]

    recommendation_parts = []
    action_plan = []
    home_remedies = []

    # --- 1. Emergency Triggers ---
    if high_severity:
        names = ", ".join(p["name"] for p in high_severity)
        recommendation_parts.append(
            f"🔴 **Action required.** Some parameters show significantly abnormal values: {names}. "
            f"Please schedule a consultation with the relevant specialist as soon as possible."
        )

    # --- 2. Specialty Routing & Action Plan ---
    specialties = set()
    for p in high_severity + moderate_severity:
        name_lower = p["name"].lower()
        if any(k in name_lower for k in ["hba1c", "glucose", "sugar", "insulin"]):
            specialties.add("Endocrinologist")
            action_plan.append("Consult an Endocrinologist for blood sugar management.")
        elif any(k in name_lower for k in ["cholesterol", "ldl", "hdl", "triglyceride"]):
            specialties.add("Cardiologist")
            action_plan.append("Schedule a lipid profile re-test in 8-12 weeks.")
            action_plan.append("Consult a Cardiologist regarding cholesterol levels.")
        elif any(k in name_lower for k in ["creatinine", "urea", "bun", "egfr"]):
            specialties.add("Nephrologist")
            action_plan.append("Consult a Nephrologist for kidney function review.")
        elif any(k in name_lower for k in ["hemoglobin", "rbc", "wbc", "platelet"]):
            specialties.add("Hematologist")
            action_plan.append("Consult a Hematologist or General Physician regarding blood count.")
        elif any(k in name_lower for k in ["tsh", "t3", "t4", "thyroid"]):
            specialties.add("Endocrinologist")
            action_plan.append("Consult an Endocrinologist for thyroid evaluation.")
        elif any(k in name_lower for k in ["alt", "ast", "bilirubin", "albumin"]):
            specialties.add("Gastroenterologist")
            action_plan.append("Consult a Gastroenterologist for liver health assessment.")

    # --- 3. Lifestyle Suggestions ---
    if moderate_severity or low_severity:
        action_plan.append("Increase daily water intake to 2.5–3 liters.")
        action_plan.append("Maintain at least 30 minutes of moderate physical activity daily.")
        action_plan.append("Focus on a balanced diet rich in whole grains and fresh vegetables.")

    # --- 4. Ayurveda & Home Remedies ---
    abnormal = high_severity + moderate_severity + low_severity
    if abnormal:
        home_remedies = _get_ayurveda_remedies(abnormal)

    # Fallback if everything is normal
    if not recommendation_parts and not abnormal:
        recommendation_parts.append(
            "✅ All parameters appear within normal ranges. Continue routine health check-ups "
            "as recommended by your physician."
        )

    # --- 5. Health Consequences / Risks ---
    health_risks = _get_health_risks(abnormal)

    # Combine recommendation text
    full_text = "\n\n".join(recommendation_parts)
    if not full_text:
        full_text = "Analysis complete. Please see the detailed sections below for insights and next steps."

    return {
        "recommendation_text": full_text + f"\n\n⚕️ *{MANDATORY_DISCLAIMER}*",
        "home_remedies": home_remedies,
        "action_plan": action_plan if action_plan else ["Continue regular health monitoring."],
        "health_risks": health_risks,
    }


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


# ─── Health Risks & Consequences Knowledge Base ─────────────────────────
HEALTH_RISKS = {
    "ra factor": "Elevated Rheumatoid Factor (RA Factor) is commonly associated with Rheumatoid Arthritis and can lead to joint inflammation, stiffness, and long-term joint damage if left unmanaged.",
    "uric acid": "High Uric Acid levels can lead to the formation of urate crystals in the joints, causing painful gout attacks and increasing the risk of kidney stones.",
    "hba1c": "Chronically high HbA1c indicates poorly controlled blood sugar, which can lead to nerve damage (neuropathy), vision loss (retinopathy), and increased cardiovascular risk.",
    "glucose": "Elevated glucose increases the risk of developing type 2 diabetes and associated metabolic disorders.",
    "cholesterol": "High total cholesterol contributes to plaque buildup in arteries (atherosclerosis), significantly increasing the risk of heart attacks and strokes.",
    "ldl": "High LDL ('bad') cholesterol directly contributes to arterial blockages and cardiovascular disease.",
    "hdl": "Low HDL ('good') cholesterol means your body is less efficient at clearing 'bad' cholesterol from your bloodstream, increasing heart disease risk.",
    "triglyceride": "High triglycerides, often coupled with low HDL or high LDL, increase the risk of acute pancreatitis and heart disease.",
    "creatinine": "Elevated creatinine suggests impaired kidney function, which can lead to chronic kidney disease or failure to filter toxins from the blood.",
    "urea": "High urea (BUN) levels indicate reduced kidney filtering capacity and can result in uremia (toxin buildup in the blood).",
    "hemoglobin": "Low hemoglobin (anemia) reduces the oxygen-carrying capacity of blood, leading to chronic fatigue, weakness, and shortness of breath.",
    "tsh": "Abnormal TSH levels disrupt metabolism. High TSH indicates hypothyroidism (weight gain, fatigue), while low TSH indicates hyperthyroidism (weight loss, rapid heart rate).",
    "alt": "Elevated ALT indicates liver cell damage or inflammation, potentially leading to fatty liver disease, hepatitis, or liver cirrhosis.",
    "ast": "Elevated AST suggests damage to the liver, heart, or skeletal muscles.",
    "bilirubin": "High bilirubin can cause jaundice (yellowing of skin/eyes) and indicates liver dysfunction or bile duct obstruction.",
    "vitamin d": "Severe Vitamin D deficiency weakens bones (osteoporosis), impairs immune function, and is linked to chronic fatigue.",
    "iron": "Iron deficiency leads to anemia, causing lethargy, pale skin, and impaired cognitive function.",
    "calcium": "Low calcium weakens bone density over time and can cause muscle cramps and cardiac arrhythmias.",
}

def _get_health_risks(abnormal_params: list) -> list:
    """Map abnormal parameters to their clinical consequences/risks dynamically using Gemini + Google Search."""
    if not abnormal_params:
        return []

    try:
        client = genai.Client(api_key=settings.GEMINI_API_KEY)
        
        # Build a list of issues to search
        issues_list = [f"{p.get('status', 'abnormal')} {p['name']} (value: {p['value']} {p.get('unit', '')})" for p in abnormal_params]
        issues_text = "\n".join([f"- {issue}" for issue in issues_list])

        prompt = f"""You are a medical explainer. Search the web for the medical consequences and health risks of the following abnormal lab results:

{issues_text}

For each abnormal parameter, provide a 1-2 sentence explanation of what health risks or consequences this specific abnormality can lead to if left unmanaged.

Return ONLY a valid JSON array of strings. Each string should be formatted like: "**[High/Low] [Parameter Name]**: [Consequence explanation]"
Do NOT include any markdown blocks or intro text, just the raw JSON array.
"""

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
        if isinstance(data, list):
            return data
            
    except Exception as e:
        print(f"[SafetyClassifier] Error fetching dynamic health risks: {e}")
        
    # Fallback to local hardcoded dictionary if API fails
    risks = []
    seen = set()

    for p in abnormal_params:
        name_lower = p["name"].lower().strip()
        for key, consequence in HEALTH_RISKS.items():
            if key in name_lower and key not in seen:
                seen.add(key)
                direction = "Low" if p.get("status") == "low" else "Elevated"
                risks.append(f"**{direction} {p['name']}**: {consequence}")
                break

    return risks
