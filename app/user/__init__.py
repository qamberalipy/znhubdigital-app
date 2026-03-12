from fastapi import APIRouter
from app.user.user import router

API_STR = "/api/users"

user_router = APIRouter(prefix=API_STR)
user_router.include_router(router)