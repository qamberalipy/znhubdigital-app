from fastapi import APIRouter, Depends, Query, BackgroundTasks
from sqlalchemy.orm import Session
from typing import List, Optional

import app.core.db.session as _database
import app.user.user as _user_auth
import app.user.models as _user_models
import app.task.schema as _schemas
import app.task.service as _services

router = APIRouter(tags=["PROJECT & TASK MANAGEMENT"])

def get_db():
    db = _database.SessionLocal()
    try: yield db
    finally: db.close()

# ==========================================
# PROJECT ROUTES
# ==========================================
@router.get("/assignable-users")
def get_assignable_users(
    current_user: _user_models.User = Depends(_user_auth.get_current_user),
    db: Session = Depends(get_db)
):
    """Allows any employee to fetch users to assign tasks to them."""
    users = db.query(_user_models.User).filter(_user_models.User.is_deleted == False).all()
    # Filter out client roles, only keep team
    return [u for u in users if u.role in ["admin", "sale", "lead_generator", "developer"]]
@router.post("/projects", response_model=_schemas.ProjectOut)
def create_project(
    project_in: _schemas.ProjectCreate,
    current_user: _user_models.User = Depends(_user_auth.get_current_user),
    db: Session = Depends(get_db)
):
    """Admin Only: Create a new project and assign members."""
    return _services.create_project(db, project_in, current_user)

@router.put("/projects/{project_id}", response_model=_schemas.ProjectOut)
def update_project(
    project_id: int,
    project_in: _schemas.ProjectUpdate,
    current_user: _user_models.User = Depends(_user_auth.get_current_user),
    db: Session = Depends(get_db)
):
    """Admin Only: Update project details."""
    return _services.update_project(db, project_id, project_in, current_user)

@router.delete("/projects/{project_id}")
def delete_project(
    project_id: int,
    current_user: _user_models.User = Depends(_user_auth.get_current_user),
    db: Session = Depends(get_db)
):
    """Admin Only: Delete a project."""
    return _services.delete_project(db, project_id, current_user)

@router.post("/projects/{project_id}/members", response_model=_schemas.ProjectOut)
def add_project_members(
    project_id: int,
    members_in: _schemas.ProjectAssignUsers,
    current_user: _user_models.User = Depends(_user_auth.get_current_user),
    db: Session = Depends(get_db)
):
    """Admin Only: Add/Update users for a project."""
    return _services.add_members_to_project(db, project_id, members_in.user_ids, current_user)

@router.get("/projects", response_model=List[_schemas.ProjectOut])
def get_projects(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    current_user: _user_models.User = Depends(_user_auth.get_current_user),
    db: Session = Depends(get_db)
):
    """Get projects for dropdown."""
    return _services.get_projects(db, current_user, skip, limit)

@router.post("/", response_model=_schemas.TaskOut)
def create_task(
    task_in: _schemas.TaskCreate,
    bg_tasks: BackgroundTasks,
    current_user: _user_models.User = Depends(_user_auth.get_current_user),
    db: Session = Depends(get_db)
):
    """Any User: Create a new task."""
    return _services.create_task(db, task_in, current_user, bg_tasks)

@router.put("/{task_id}", response_model=_schemas.TaskOut)
def update_task(
    task_id: int,
    task_in: _schemas.TaskCreate,
    current_user: _user_models.User = Depends(_user_auth.get_current_user),
    db: Session = Depends(get_db)
):
    """Any User: Update an existing task."""
    return _services.update_task(db, task_id, task_in, current_user)

@router.delete("/{task_id}")
def delete_task(
    task_id: int,
    current_user: _user_models.User = Depends(_user_auth.get_current_user),
    db: Session = Depends(get_db)
):
    """Owner Only: Delete a task."""
    return _services.delete_task(db, task_id, current_user)

@router.get("/", response_model=_schemas.PaginatedTaskResponse)
def get_tasks(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    status: Optional[str] = None,
    project_id: Optional[int] = None,
    current_user: _user_models.User = Depends(_user_auth.get_current_user),
    db: Session = Depends(get_db)
):
    """Get all tasks across the organization."""
    return _services.get_tasks(db, current_user, skip, limit, status, project_id)

@router.get("/{task_id}", response_model=_schemas.TaskDetailOut)
def get_task_detail(
    task_id: int,
    current_user: _user_models.User = Depends(_user_auth.get_current_user),
    db: Session = Depends(get_db)
):
    """Get full details, comments, and attachments."""
    return _services.get_task_detail(db, task_id, current_user)

@router.patch("/{task_id}/status", response_model=_schemas.TaskOut)
def update_task_status(
    task_id: int,
    status_in: _schemas.TaskStatusUpdate,
    bg_tasks: BackgroundTasks,
    current_user: _user_models.User = Depends(_user_auth.get_current_user),
    db: Session = Depends(get_db)
):
    """Update task progress status."""
    return _services.update_task_status(db, task_id, status_in, current_user, bg_tasks)

@router.post("/{task_id}/comments", response_model=_schemas.TaskCommentOut)
def add_task_comment(
    task_id: int,
    comment_in: _schemas.TaskCommentCreate,
    bg_tasks: BackgroundTasks,
    current_user: _user_models.User = Depends(_user_auth.get_current_user),
    db: Session = Depends(get_db)
):
    """Add a structured comment."""
    return _services.add_comment(db, task_id, comment_in, current_user, bg_tasks)

@router.post("/{task_id}/attachments", response_model=_schemas.TaskAttachmentOut)
def add_task_attachment(
    task_id: int,
    attachment_in: _schemas.TaskAttachmentCreate,
    current_user: _user_models.User = Depends(_user_auth.get_current_user),
    db: Session = Depends(get_db)
):
    """Add a deliverable file."""
    return _services.add_attachment(db, task_id, attachment_in, current_user)

@router.delete("/attachments/{attachment_id}")
def delete_task_attachment(
    attachment_id: int,
    current_user: _user_models.User = Depends(_user_auth.get_current_user),
    db: Session = Depends(get_db)
):
    """Remove a deliverable file."""
    return _services.delete_attachment(db, attachment_id, current_user)