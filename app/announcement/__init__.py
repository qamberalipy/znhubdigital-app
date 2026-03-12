from fastapi import APIRouter
# app/announcement/__init__.py
from app.announcement.announcement import router, ws_router # <--- Import ws_router

API_STR = "/api/announcement"

announcement_router = APIRouter(prefix=API_STR)
announcement_router.include_router(router)

# We will export ws_router separately or include it here if we change how it's mounted in main.py