from fastapi import APIRouter
from app.api.v1 import chat, providers, cost, report

api_router = APIRouter()
api_router.include_router(chat.router, prefix="/chat", tags=["chat"])
api_router.include_router(providers.router, prefix="/providers", tags=["providers"])
api_router.include_router(cost.router, prefix="/cost-estimate", tags=["cost-estimate"])
api_router.include_router(report.router, prefix="/report", tags=["report"])
