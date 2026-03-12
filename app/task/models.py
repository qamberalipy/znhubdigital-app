from enum import Enum as _PyEnum
import sqlalchemy as _sql
from sqlalchemy.orm import relationship
import app.core.db.session as _database

# --- Updated Enums ---
class TaskStatus(str, _PyEnum):
    todo = "To Do"       
    blocked = "Blocked"
    completed = "Completed"
    missed = "Missed" 

class TaskPriority(str, _PyEnum):
    low = "Low"
    medium = "Medium"
    high = "High"

class ContentType(str, _PyEnum):
    ppv = "PPV"
    feed = "Feed"
    promo = "Promo"
    story = "Story"
    other = "Other"

class ContentStatus(str, _PyEnum):
    pending = "Pending Review"
    approved = "Approved"
    rejected = "Rejected"
    archived = "Archived"

# --- Models ---
class Task(_database.Base):
    __tablename__ = "task"
    id = _sql.Column(_sql.Integer, primary_key=True, index=True)
    assigner_id = _sql.Column(_sql.Integer, _sql.ForeignKey("user.id"), nullable=False)
    assignee_id = _sql.Column(_sql.Integer, _sql.ForeignKey("user.id"), nullable=False)
    title = _sql.Column(_sql.String(150), nullable=False)
    description = _sql.Column(_sql.Text, nullable=True)
    
    status = _sql.Column(_sql.String, default=TaskStatus.todo.value, nullable=False)
    priority = _sql.Column(_sql.String, default=TaskPriority.medium.value, nullable=False)
    
    due_date = _sql.Column(_sql.DateTime, nullable=True)
    completed_at = _sql.Column(_sql.DateTime, nullable=True)
    
    req_content_type = _sql.Column(_sql.String, nullable=False, default=ContentType.other.value)
    
    req_quantity = _sql.Column(_sql.Integer, default=1, nullable=False)
    req_duration_min = _sql.Column(_sql.Integer, nullable=True)
    req_outfit_tags = _sql.Column(_sql.String(500), nullable=True)
    req_face_visible = _sql.Column(_sql.Boolean, default=True)
    req_watermark = _sql.Column(_sql.Boolean, default=False)
    context = _sql.Column(_sql.String(100), default="General")
    created_at = _sql.Column(_sql.DateTime(timezone=True), server_default=_sql.func.now())
    updated_at = _sql.Column(_sql.DateTime(timezone=True), onupdate=_sql.func.now())

    assigner = relationship("User", foreign_keys=[assigner_id], backref="tasks_created")
    assignee = relationship("User", foreign_keys=[assignee_id], backref="tasks_assigned")
    chat_messages = relationship("TaskChat", back_populates="task", cascade="all, delete-orphan")
    attachments = relationship("ContentVault", back_populates="task", cascade="all, delete-orphan")

class TaskChat(_database.Base):
    __tablename__ = "task_chat"
    id = _sql.Column(_sql.Integer, primary_key=True, index=True)
    task_id = _sql.Column(_sql.Integer, _sql.ForeignKey("task.id"), nullable=False)
    user_id = _sql.Column(_sql.Integer, _sql.ForeignKey("user.id"), nullable=False)
    message = _sql.Column(_sql.Text, nullable=False)
    is_system_log = _sql.Column(_sql.Boolean, default=False)
    created_at = _sql.Column(_sql.DateTime(timezone=True), server_default=_sql.func.now())
    task = relationship("Task", back_populates="chat_messages")
    author = relationship("User")

class ContentVault(_database.Base):
    __tablename__ = "content_vault"
    id = _sql.Column(_sql.Integer, primary_key=True, index=True)
    uploader_id = _sql.Column(_sql.Integer, _sql.ForeignKey("user.id"), nullable=False)
    task_id = _sql.Column(_sql.Integer, _sql.ForeignKey("task.id"), nullable=True)
    file_url = _sql.Column(_sql.String(500), nullable=False)
    thumbnail_url = _sql.Column(_sql.String(500), nullable=True)
    file_size_mb = _sql.Column(_sql.Float, nullable=True)
    mime_type = _sql.Column(_sql.String(50), nullable=True)
    duration_seconds = _sql.Column(_sql.Integer, nullable=True)
    
    # [PERMANENT FIX] Use String here as well
    content_type = _sql.Column(_sql.String, nullable=False)
    tags = _sql.Column(_sql.String(255), nullable=True)
    status = _sql.Column(_sql.String, default=ContentStatus.pending.value)
    
    created_at = _sql.Column(_sql.DateTime(timezone=True), server_default=_sql.func.now())
    uploader = relationship("User", foreign_keys=[uploader_id])
    task = relationship("Task", back_populates="attachments")