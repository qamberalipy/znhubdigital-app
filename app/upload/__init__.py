from fastapi import APIRouter
from app.upload.upload import router

API_STR = "/api/upload"

upload_router = APIRouter(prefix=API_STR)
upload_router.include_router(router)