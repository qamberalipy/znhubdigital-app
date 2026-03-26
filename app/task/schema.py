from typing import Optional, List
from pydantic import BaseModel, Field
from datetime import datetime
from app.task.models import TaskStatus, TaskPriority

class UserMinimal(BaseModel):
    id: int
    full_name: Optional[str] = None
    role: str
    class Config:
        orm_mode = True

# --- Attachments ---
# --- Attachments ---
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
        orm_mode = True

# --- Comments ---
class TaskCommentCreate(BaseModel):
    comment: str = Field(..., min_length=1)

class TaskCommentOut(BaseModel):
    id: int
    comment: str
    is_system_log: bool
    created_at: datetime
    author: UserMinimal
    class Config:
        orm_mode = True

# --- Tasks ---
class TaskCreate(BaseModel):
    title: str = Field(..., min_length=1)
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
    title: str
    description: Optional[str]
    status: str
    priority: str
    lead_id: Optional[int]
    due_date: Optional[datetime]
    created_at: datetime
    
    assigner: UserMinimal
    assignee: UserMinimal
    
    class Config:
        orm_mode = True

class TaskDetailOut(TaskOut):
    comments: List[TaskCommentOut] = []
    attachments: List[TaskAttachmentOut] = []

class PaginatedTaskResponse(BaseModel):
    total: int
    skip: int
    limit: int
    tasks: List[TaskOut]