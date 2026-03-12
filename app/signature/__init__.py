from fastapi import APIRouter
from app.signature.signature import router

API_STR = "/api/signature"

signature_router = APIRouter(prefix=API_STR)
signature_router.include_router(router)