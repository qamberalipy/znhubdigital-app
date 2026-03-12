from fastapi import APIRouter
from app.task.task import router

API_STR = "/api/tasks"

task_router = APIRouter(prefix=API_STR)
task_router.include_router(router)