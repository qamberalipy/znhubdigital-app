from typing import Optional, List
from pydantic import BaseModel, Field
from datetime import datetime
from app.task.models import TaskStatus, TaskPriority, ProjectStatus

# --- Generic User Reference ---
class UserMinimal(BaseModel):
    id: int
    full_name: Optional[str] = None
    role: str

    class Config:
        from_attributes = True

# ==========================================
# PROJECT SCHEMAS
# ==========================================
class ProjectCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=150)
    description: Optional[str] = None
    member_ids: List[int] = []  # Users to assign upon creation

class ProjectAssignUsers(BaseModel):
    user_ids: List[int]

class ProjectUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=150)
    description: Optional[str] = None
    status: Optional[ProjectStatus] = None

class ProjectOut(BaseModel):
    id: int
    name: str
    description: Optional[str]
    status: str
    created_by_id: int
    created_at: datetime
    members: List[UserMinimal] = [] 

    class Config:
        from_attributes = True

# ==========================================
# TASK SCHEMAS
# ==========================================
class TaskAttachmentCreate(BaseModel):
    file_url: str
    file_name: Optional[str] = None
    thumbnail_url: Optional[str] = None
    file_size_mb: Optional[float] = None
    mime_type: Optional[str] = None
    duration_seconds: Optional[int] = None

class TaskAttachmentOut(BaseModel):
    id: int
    file_url: str
    file_name: Optional[str]
    thumbnail_url: Optional[str] = None
    file_size_mb: Optional[float] = None
    mime_type: Optional[str] = None
    duration_seconds: Optional[int] = None
    uploader: UserMinimal
    created_at: datetime

    class Config:
        from_attributes = True

class TaskCommentCreate(BaseModel):
    comment: str = Field(..., min_length=1)

class TaskCommentOut(BaseModel):
    id: int
    comment: str
    is_system_log: bool
    created_at: datetime
    author: UserMinimal

    class Config:
        from_attributes = True

class TaskCreate(BaseModel):
    project_id: int 
    title: str = Field(..., min_length=1, max_length=150)
    description: Optional[str] = None
    assignee_id: int
    lead_id: Optional[int] = None
    priority: TaskPriority = TaskPriority.medium
    due_date: Optional[datetime] = None
    attachments: Optional[List[TaskAttachmentCreate]] = []

class TaskStatusUpdate(BaseModel):
    status: TaskStatus

class TaskOut(BaseModel):
    id: int
    project_id: int
    title: str
    description: Optional[str]
    status: str
    priority: str
    lead_id: Optional[int]
    due_date: Optional[datetime]
    created_at: datetime
    assignee: UserMinimal
    assigner: UserMinimal

    class Config:
        from_attributes = True

class TaskDetailOut(TaskOut):
    comments: List[TaskCommentOut] = []
    attachments: List[TaskAttachmentOut] = []

class PaginatedTaskResponse(BaseModel):
    total: int
    skip: int
    limit: int
    tasks: List[TaskOut]