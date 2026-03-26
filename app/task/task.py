from fastapi import APIRouter, Depends, Query, BackgroundTasks
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime

import app.core.db.session as _database
import app.user.user as _user_auth
import app.user.models as _user_models
import app.task.schema as _schemas
import app.task.service as _services

router = APIRouter(tags=["KANBAN TASK MANAGEMENT"])

def get_db():
    db = _database.SessionLocal()
    try: yield db
    finally: db.close()

@router.post("/", response_model=_schemas.TaskOut)
def create_task(
    task_in: _schemas.TaskCreate,
    bg_tasks: BackgroundTasks,
    current_user: _user_models.User = Depends(_user_auth.get_current_user),
    db: Session = Depends(get_db)
):
    return _services.create_task(db, task_in, current_user, bg_tasks)

@router.get("/", response_model=_schemas.PaginatedTaskResponse)
def get_tasks(
    skip: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=100),
    status: Optional[str] = None,
    priority: Optional[str] = None,
    assignee_id: Optional[int] = None,
    lead_id: Optional[int] = None,
    current_user: _user_models.User = Depends(_user_auth.get_current_user),
    db: Session = Depends(get_db)
):
    return _services.get_tasks(db, current_user, skip, limit, status, priority, assignee_id, lead_id)

@router.get("/{task_id}", response_model=_schemas.TaskDetailOut)
def get_task_detail(
    task_id: int,
    current_user: _user_models.User = Depends(_user_auth.get_current_user),
    db: Session = Depends(get_db)
):
    return _services.get_task_detail(db, task_id, current_user)

@router.patch("/{task_id}/status", response_model=_schemas.TaskOut)
def update_status(
    task_id: int,
    status_in: _schemas.TaskStatusUpdate,
    bg_tasks: BackgroundTasks,
    current_user: _user_models.User = Depends(_user_auth.get_current_user),
    db: Session = Depends(get_db)
):
    return _services.update_task_status(db, task_id, status_in, current_user, bg_tasks)

@router.post("/{task_id}/comments", response_model=_schemas.TaskCommentOut)
def add_task_update_comment(
    task_id: int,
    comment_in: _schemas.TaskCommentCreate,
    bg_tasks: BackgroundTasks,
    current_user: _user_models.User = Depends(_user_auth.get_current_user),
    db: Session = Depends(get_db)
):
    return _services.add_comment(db, task_id, comment_in, current_user, bg_tasks)

@router.post("/{task_id}/attachments", response_model=_schemas.TaskAttachmentOut)
def upload_task_attachment(
    task_id: int,
    attachment_in: _schemas.TaskAttachmentCreate,
    current_user: _user_models.User = Depends(_user_auth.get_current_user),
    db: Session = Depends(get_db)
):
    return _services.add_attachment(db, task_id, attachment_in, current_user)