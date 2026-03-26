from enum import Enum as _PyEnum
import sqlalchemy as _sql
from sqlalchemy.orm import relationship
import app.core.db.session as _database

class TaskStatus(str, _PyEnum):
    todo = "To Do"
    in_progress = "In Progress"
    review = "Review"
    completed = "Completed"

class TaskPriority(str, _PyEnum):
    low = "Low"
    medium = "Medium"
    high = "High"

class Task(_database.Base):
    __tablename__ = "task"
    
    id = _sql.Column(_sql.Integer, primary_key=True, index=True)
    title = _sql.Column(_sql.String(150), nullable=False)
    description = _sql.Column(_sql.Text, nullable=True)
    
    # Relationships
    assigner_id = _sql.Column(_sql.Integer, _sql.ForeignKey("user.id"), nullable=False)
    assignee_id = _sql.Column(_sql.Integer, _sql.ForeignKey("user.id"), nullable=False)
    lead_id = _sql.Column(_sql.Integer, nullable=True) # Manual Lead ID
    
    status = _sql.Column(_sql.String, nullable=False, default=TaskStatus.todo.value)
    priority = _sql.Column(_sql.String, nullable=False, default=TaskPriority.medium.value)
    due_date = _sql.Column(_sql.DateTime(timezone=True), nullable=True)
    
    created_at = _sql.Column(_sql.DateTime(timezone=True), server_default=_sql.func.now())
    updated_at = _sql.Column(_sql.DateTime(timezone=True), onupdate=_sql.func.now())
    
    assigner = relationship("User", foreign_keys=[assigner_id])
    assignee = relationship("User", foreign_keys=[assignee_id])
    
    comments = relationship("TaskComment", back_populates="task", cascade="all, delete-orphan")
    attachments = relationship("TaskAttachment", back_populates="task", cascade="all, delete-orphan")


class TaskComment(_database.Base):
    __tablename__ = "task_comment"
    
    id = _sql.Column(_sql.Integer, primary_key=True, index=True)
    task_id = _sql.Column(_sql.Integer, _sql.ForeignKey("task.id"), nullable=False)
    user_id = _sql.Column(_sql.Integer, _sql.ForeignKey("user.id"), nullable=False)
    
    comment = _sql.Column(_sql.Text, nullable=False)
    is_system_log = _sql.Column(_sql.Boolean, default=False)
    
    created_at = _sql.Column(_sql.DateTime(timezone=True), server_default=_sql.func.now())
    
    task = relationship("Task", back_populates="comments")
    author = relationship("User")


class TaskAttachment(_database.Base):
    __tablename__ = "task_attachment"
    
    id = _sql.Column(_sql.Integer, primary_key=True, index=True)
    task_id = _sql.Column(_sql.Integer, _sql.ForeignKey("task.id"), nullable=False)
    uploader_id = _sql.Column(_sql.Integer, _sql.ForeignKey("user.id"), nullable=False)
    
    file_url = _sql.Column(_sql.String(500), nullable=False)
    file_name = _sql.Column(_sql.String(255), nullable=True)
    
    # --- MEDIA FIELDS ADDED ---
    thumbnail_url = _sql.Column(_sql.String(500), nullable=True)
    file_size_mb = _sql.Column(_sql.Float, nullable=True)
    mime_type = _sql.Column(_sql.String(100), nullable=True)
    duration_seconds = _sql.Column(_sql.Integer, nullable=True)
    
    created_at = _sql.Column(_sql.DateTime(timezone=True), server_default=_sql.func.now())
    
    task = relationship("Task", back_populates="attachments")
    uploader = relationship("User")