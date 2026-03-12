from fastapi import APIRouter
from app.content_vault.contentvault import router

API_STR = "/api/content_vault"

content_vault_router = APIRouter(prefix=API_STR)
content_vault_router.include_router(router)