import json
import re
import time
from typing import Optional
from google import genai
from google.genai import types
from groq import Groq
from app.core.config import settings
from app.schemas.intent import IntentOutput

def initialize_client():
    return genai.Client(api_key=settings.GEMINI_API_KEY)


def _try_gemini_extract(client, prompt: str, max_retries: int = 3) -> Optional[dict]:
    """Try calling Gemini with retries on 503/overload errors."""
    for attempt in range(max_retries):
        try:
            response = client.models.generate_content(
                model='gemini-2.0-flash',
                contents=prompt,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                ),
            )
            data = json.loads(response.text)
            return data
        except Exception as e:
            error_str = str(e)
            if "429" in error_str or "RESOURCE_EXHAUSTED" in error_str:
                if settings.GROQ_API_KEY:
                    print("[AI Service] Gemini Quota Exceeded. Falling back to Groq.")
                    try:
                        groq_client = Groq(api_key=settings.GROQ_API_KEY)
                        groq_response = groq_client.chat.completions.create(
                            model="llama-3.3-70b-versatile",
                            messages=[{"role": "system", "content": "You are a helpful assistant that outputs only valid JSON."}, 
                                      {"role": "user", "content": prompt}],
                            temperature=0.1,
                            response_format={"type": "json_object"}
                        )
                        return json.loads(groq_response.choices[0].message.content)
                    except Exception as groq_err:
                        print(f"[AI Service] Groq fallback failed: {groq_err}")
                        return None
                return None
            elif "503" in error_str or "UNAVAILABLE" in error_str or "overloaded" in error_str.lower():
                wait = 2 ** attempt
                print(f"[AI Service] Gemini overloaded, retrying in {wait}s (attempt {attempt+1}/{max_retries})")
                time.sleep(wait)
                continue
            else:
                print(f"[AI Service] Gemini error: {e}")
                return None
    return None


def _fallback_regex_extract(user_message: str) -> dict:
    """
    Rule-based fallback when Gemini is unavailable.
    Extracts procedure, location, budget, age, and comorbidities via regex/keywords.
    """
    msg = user_message.lower()
    data = {}

    # --- Procedure Detection ---
    procedures = {
        "angioplasty": "coronary angioplasty",
        "bypass": "coronary artery bypass graft",
        "knee replacement": "knee replacement",
        "hip replacement": "hip replacement",
        "cataract": "cataract surgery",
        "appendix": "appendectomy",
        "appendectomy": "appendectomy",
        "gallstone": "cholecystectomy",
        "cholecystectomy": "cholecystectomy",
        "hernia": "hernia repair",
        "c-section": "caesarean section",
        "cesarean": "caesarean section",
        "dialysis": "dialysis",
        "chemotherapy": "chemotherapy",
        "endoscopy": "endoscopy",
        "colonoscopy": "colonoscopy",
        "mri": "MRI scan",
        "ct scan": "CT scan",
    }
    for keyword, procedure_name in procedures.items():
        if keyword in msg:
            data["procedure"] = procedure_name
            break

    # --- Condition/symptom ---
    conditions = [
        "chest pain", "back pain", "headache", "fever", "cough",
        "cold", "diabetes", "hypertension", "high blood pressure",
        "shortness of breath", "abdominal pain", "joint pain",
    ]
    for cond in conditions:
        if cond in msg:
            data["condition"] = cond
            break

    # --- Location ---
    cities = [
        "Mumbai", "Delhi", "Bangalore", "Bengaluru", "Hyderabad", "Chennai",
        "Kolkata", "Pune", "Nagpur", "Jaipur", "Lucknow", "Ahmedabad",
        "Indore", "Bhopal", "Patna", "Chandigarh", "Coimbatore", "Kochi",
        "Gurgaon", "Noida", "Thane", "Nashik", "Surat", "Vadodara",
    ]
    for city in cities:
        if city.lower() in msg:
            data["location"] = city
            break

    # --- Budget ---
    budget_match = re.search(r'(\d+)\s*(?:lakh|lac|l)', msg)
    if budget_match:
        data["budget_inr"] = int(budget_match.group(1)) * 100000
    else:
        budget_match = re.search(r'(?:budget|rs|₹|inr)\s*(\d[\d,]*)', msg)
        if budget_match:
            data["budget_inr"] = int(budget_match.group(1).replace(",", ""))

    # --- Age ---
    age_match = re.search(r'age\s*(\d{1,3})', msg)
    if age_match:
        data["age"] = int(age_match.group(1))
    else:
        age_match = re.search(r"i'?m\s*(\d{1,3})", msg)
        if age_match:
            data["age"] = int(age_match.group(1))

    # --- Comorbidities ---
    comorbidity_map = {
        "diabetic": "diabetes", "diabetes": "diabetes",
        "hypertension": "hypertension", "bp": "hypertension",
        "high blood pressure": "hypertension",
        "asthma": "asthma", "thyroid": "thyroid disorder",
        "heart disease": "heart disease", "kidney": "kidney disease",
        "obesity": "obesity",
    }
    found = []
    for keyword, name in comorbidity_map.items():
        if keyword in msg and name not in found:
            found.append(name)
    if found:
        data["comorbidities"] = found

    # --- Urgency ---
    if any(w in msg for w in ["emergency", "urgent", "immediately", "asap"]):
        data["urgency"] = "urgent"
    else:
        data["urgency"] = "elective"

    return data


def extract_intent(user_message: str) -> IntentOutput:
    """Extract structured intent — tries Gemini first, falls back to regex."""
    client = initialize_client()

    prompt = f"""Extract the health/medical intent from this user query: "{user_message}"

Map the extracted information to the following JSON schema. If an attribute is not present, use null.
Fields needed: condition, procedure, location, budget_inr (must be integer), age (integer), comorbidities (array of strings), urgency (elective, urgent, emergency).

Important rules:
- "3 lakh" = 300000, "5 lakh" = 500000, etc.
- "diabetic" means comorbidities should include "diabetes"
- Location should include city and state abbreviation if known (e.g. "Nagpur, MH")
- Procedure should be the normalized medical name

Respond with ONLY valid JSON matching this structure."""

    # Try Gemini with retries
    data = _try_gemini_extract(client, prompt)

    if data:
        try:
            return IntentOutput(**data)
        except Exception:
            pass

    # Fallback: regex-based extraction
    print("[AI Service] Using regex fallback for intent extraction")
    fallback_data = _fallback_regex_extract(user_message)
    return IntentOutput(**fallback_data)


def generate_chat_reply(user_message: str, intent: IntentOutput) -> str:
    """Generate a user-friendly reply based on the extracted intent or use LLM for casual talk."""
    if intent.procedure or intent.condition:
        parts = []
        if intent.procedure:
            parts.append(f"I found information about **{intent.procedure}**")
        elif intent.condition:
            parts.append(f"I understand you're concerned about **{intent.condition}**")

        if intent.location:
            parts.append(f"in **{intent.location}**")

        reply = " ".join(parts) + "."

        details = []
        if intent.budget_inr:
            details.append(f"Budget: ₹{intent.budget_inr:,}")
        if intent.age:
            details.append(f"Age: {intent.age}")
        if intent.comorbidities:
            details.append(f"Conditions: {', '.join(intent.comorbidities)}")
        if intent.urgency:
            details.append(f"Urgency: {intent.urgency}")

        if details:
            reply += " " + " | ".join(details) + "."

        if intent.procedure:
            reply += "\n\nI've pulled up cost estimates and top-rated providers for you — check the panel on the right."
        reply += "\n\n⚕️ *This is decision-support information, not medical advice.*"
        return reply

    # Casual talk (no procedure or condition detected)
    try:
        client = initialize_client()
        prompt = f"You are Clinivue Assistant, a friendly and helpful healthcare AI guide. The user said: '{user_message}'. Respond naturally, nicely, and concisely (1-2 sentences). Do not provide any medical advice. If they say hi, greet them back and ask how you can help with their healthcare needs."
        
        for attempt in range(2):
            try:
                response = client.models.generate_content(
                    model='gemini-2.0-flash',
                    contents=prompt,
                )
                if response.text:
                    return response.text
            except Exception as e:
                error_str = str(e)
                if "429" in error_str or "RESOURCE_EXHAUSTED" in error_str:
                    if settings.GROQ_API_KEY:
                        groq_client = Groq(api_key=settings.GROQ_API_KEY)
                        groq_response = groq_client.chat.completions.create(
                            model="llama-3.3-70b-versatile",
                            messages=[{"role": "system", "content": "You are Clinivue Assistant, a friendly healthcare AI guide. Respond concisely in 1-2 sentences. No medical advice."}, 
                                      {"role": "user", "content": user_message}],
                            temperature=0.7,
                        )
                        return groq_response.choices[0].message.content
                elif "503" in error_str or "UNAVAILABLE" in error_str:
                    time.sleep(1)
                    continue
                break
    except Exception as e:
        print(f"[AI Service] Casual reply fallback error: {e}")

    return "I'm here to help with your healthcare query. How can I assist you today?"
