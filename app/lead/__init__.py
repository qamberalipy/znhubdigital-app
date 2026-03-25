from fastapi import APIRouter
from app.lead.lead import router

# Change from "/api/lead" to "/api/leads"
API_STR = "/api/leads"

lead_router = APIRouter(prefix=API_STR)
lead_router.include_router(router)