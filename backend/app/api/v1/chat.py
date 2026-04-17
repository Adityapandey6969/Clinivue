from fastapi import APIRouter, HTTPException
from app.schemas.intent import ChatRequest, ChatResponse, ConfidenceEnvelope
from app.services.ai_service import extract_intent, generate_chat_reply

router = APIRouter()

@router.post("/", response_model=ChatResponse)
def handle_chat(request: ChatRequest):
    intent = extract_intent(request.message)
    reply = generate_chat_reply(request.message, intent)
    
    suggested_actions = ["show_providers"]
    if intent.procedure:
        suggested_actions.append("estimate_cost")
        
    return ChatResponse(
        reply=reply,
        intent=intent,
        suggested_actions=suggested_actions,
        confidence=ConfidenceEnvelope(
            confidence_score=0.85,
            risk_flags=[],
            assumptions=[]
        )
    )
