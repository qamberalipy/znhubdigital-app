# app/task/task.py
from fastapi import APIRouter, Depends, HTTPException, status, Query, BackgroundTasks
from sqlalchemy.orm import Session
from typing import List, Optional

import app.core.db.session as _database
import app.user.user as _user_auth
import app.user.models as _user_models
import app.task.schema as _schemas
import app.task.service as _services

router = APIRouter()

def get_db():
    db = _database.SessionLocal()
    try: yield db
    finally: db.close()

@router.get("/assignees", response_model=List[_schemas.UserMinimal], tags=["TASK API"])
def get_available_creators(
    current_user: _user_models.User = Depends(_user_auth.get_current_user),
    db: Session = Depends(get_db)
):
    return _services.get_my_assignees(db, current_user)

@router.get("/", response_model=_schemas.PaginatedTaskResponse, tags=["TASK API"])
def list_tasks(
    skip: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=100),
    search: Optional[str] = None,
    status: Optional[str] = None,
    assignee_id: Optional[int] = None,
    current_user: _user_models.User = Depends(_user_auth.get_current_user),
    db: Session = Depends(get_db)
):
    return _services.get_all_tasks(db, current_user, skip, limit, search, status, assignee_id)

@router.get("/{task_id}", response_model=_schemas.TaskOut, tags=["TASK API"])
def get_task(
    task_id: int,
    current_user: _user_models.User = Depends(_user_auth.get_current_user),
    db: Session = Depends(get_db)
):
    return _services.get_task_or_404(db, task_id)

@router.post("/", response_model=_schemas.TaskOut, tags=["TASK API"])
def create_task(
    task_in: _schemas.TaskCreate,
    background_tasks: BackgroundTasks, # <--- Required
    current_user: _user_models.User = Depends(_user_auth.get_current_user),
    db: Session = Depends(get_db)
):
    return _services.create_task(db, task_in, current_user, background_tasks)

@router.put("/{task_id}", response_model=_schemas.TaskOut, tags=["TASK API"])
def update_task(
    task_id: int,
    task_in: _schemas.TaskUpdate,
    background_tasks: BackgroundTasks, # <--- Required
    current_user: _user_models.User = Depends(_user_auth.get_current_user),
    db: Session = Depends(get_db)
):
    return _services.update_task(db, task_id, task_in, current_user, background_tasks)

@router.delete("/{task_id}", tags=["TASK API"])
def delete_task(
    task_id: int,
    background_tasks: BackgroundTasks, # <--- Required
    current_user: _user_models.User = Depends(_user_auth.get_current_user),
    db: Session = Depends(get_db)
):
    return _services.delete_task(db, task_id, current_user, background_tasks)

@router.post("/{task_id}/submit", response_model=_schemas.TaskOut, tags=["TASK API"])
def submit_work(
    task_id: int,
    submission: _schemas.TaskSubmission,
    background_tasks: BackgroundTasks, # <--- Required
    current_user: _user_models.User = Depends(_user_auth.get_current_user),
    db: Session = Depends(get_db)
):
    return _services.submit_task_work(db, task_id, submission, current_user, background_tasks)

@router.get("/{task_id}/chat", response_model=List[_schemas.ChatMsgOut], tags=["TASK API"])
def get_chat(
    task_id: int,
    direction: Optional[int] = Query(0),
    last_message_id: Optional[int] = Query(0),
    current_user: _user_models.User = Depends(_user_auth.get_current_user),
    db: Session = Depends(get_db)
):
    return _services.get_chat_history(db, task_id, direction, last_message_id)

@router.post("/{task_id}/chat", response_model=_schemas.ChatMsgOut, tags=["TASK API"])
def send_chat(
    task_id: int,
    chat_in: _schemas.ChatMsgCreate,
    current_user: _user_models.User = Depends(_user_auth.get_current_user),
    db: Session = Depends(get_db)
):
    return _services.send_chat_message(db, task_id, chat_in.message, current_user)

@router.delete("/content/{content_id}", tags=["TASK API"])
def remove_content_item(
    content_id: int,
    current_user: _user_models.User = Depends(_user_auth.get_current_user),
    db: Session = Depends(get_db)
):
    return _services.delete_content_item(db, content_id, current_user)