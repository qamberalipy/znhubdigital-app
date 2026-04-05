from fastapi import APIRouter
from app.finance.finance import router

API_STR = "/api/finance"

finance_router = APIRouter(prefix=API_STR)
finance_router.include_router(router)