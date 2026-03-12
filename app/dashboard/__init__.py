from fastapi import APIRouter
from app.dashboard.dashboard import router

API_STR = "/api/dashboard"

dashboard_router = APIRouter(prefix=API_STR)
dashboard_router.include_router(router)