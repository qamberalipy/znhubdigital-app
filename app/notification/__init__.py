# app/notification/__init__.py
from fastapi import APIRouter
from app.notification.notification import router, ws_router

API_STR = "/api/notification"

notification_router = APIRouter(prefix=API_STR)
notification_router.include_router(router)

# Export these to be used in main.py
__all__ = ["notification_router", "ws_router"]