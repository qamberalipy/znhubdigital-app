from fastapi import APIRouter
from app.model_invoice.model_invoice import router

API_STR = "/api/model_invoice"

model_invoice_router = APIRouter(prefix=API_STR)
model_invoice_router.include_router(router)