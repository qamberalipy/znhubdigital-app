from enum import Enum as _PyEnum
import sqlalchemy as _sql
from sqlalchemy.orm import relationship
import app.core.db.session as _database

class ProjectStatus(str, _PyEnum):
    active = "Active"
    completed = "Completed"
    on_hold = "On Hold"

class TaskStatus(str, _PyEnum):
    todo = "To Do"
    in_progress = "In Progress"
    review = "Review"
    completed = "Completed"

class TaskPriority(str, _PyEnum):
    low = "Low"
    medium = "Medium"
    high = "High"

# --- NEW: Association Table for Many-to-Many ---
project_members = _sql.Table(
    "project_members",
    _database.Base.metadata,
    _sql.Column("project_id", _sql.Integer, _sql.ForeignKey("project.id", ondelete="CASCADE"), primary_key=True),
    _sql.Column("user_id", _sql.Integer, _sql.ForeignKey("user.id", ondelete="CASCADE"), primary_key=True)
)

# --- Project Model ---
class Project(_database.Base):
    __tablename__ = "project"
    
    id = _sql.Column(_sql.Integer, primary_key=True, index=True)
    name = _sql.Column(_sql.String(150), nullable=False)
    description = _sql.Column(_sql.Text, nullable=True)
    status = _sql.Column(_sql.String, nullable=False, default=ProjectStatus.active.value)
    
    created_by_id = _sql.Column(_sql.Integer, _sql.ForeignKey("user.id"), nullable=False)
    created_at = _sql.Column(_sql.DateTime(timezone=True), server_default=_sql.func.now())
    updated_at = _sql.Column(_sql.DateTime(timezone=True), onupdate=_sql.func.now())
    
    # Relationships
    creator = relationship("User", foreign_keys=[created_by_id])
    tasks = relationship("Task", back_populates="project", cascade="all, delete-orphan")
    
    # The magical Many-to-Many relationship
    members = relationship("User", secondary=project_members, backref="assigned_projects")

# --- Task Model ---
class Task(_database.Base):
    __tablename__ = "task"
    
    id = _sql.Column(_sql.Integer, primary_key=True, index=True)
    project_id = _sql.Column(_sql.Integer, _sql.ForeignKey("project.id", ondelete="CASCADE"), nullable=False)
    
    title = _sql.Column(_sql.String(150), nullable=False)
    description = _sql.Column(_sql.Text, nullable=True)
    
    assigner_id = _sql.Column(_sql.Integer, _sql.ForeignKey("user.id"), nullable=False)
    assignee_id = _sql.Column(_sql.Integer, _sql.ForeignKey("user.id"), nullable=False)
    lead_id = _sql.Column(_sql.Integer, nullable=True)
    
    status = _sql.Column(_sql.String, nullable=False, default=TaskStatus.todo.value)
    priority = _sql.Column(_sql.String, nullable=False, default=TaskPriority.medium.value)
    due_date = _sql.Column(_sql.DateTime(timezone=True), nullable=True)
    
    created_at = _sql.Column(_sql.DateTime(timezone=True), server_default=_sql.func.now())
    updated_at = _sql.Column(_sql.DateTime(timezone=True), onupdate=_sql.func.now())
    
    project = relationship("Project", back_populates="tasks")
    assigner = relationship("User", foreign_keys=[assigner_id])
    assignee = relationship("User", foreign_keys=[assignee_id])
    comments = relationship("TaskComment", back_populates="task", cascade="all, delete-orphan")
    attachments = relationship("TaskAttachment", back_populates="task", cascade="all, delete-orphan")

# --- TaskComment and TaskAttachment Models ---
class TaskComment(_database.Base):
    __tablename__ = "task_comment"
    id = _sql.Column(_sql.Integer, primary_key=True, index=True)
    task_id = _sql.Column(_sql.Integer, _sql.ForeignKey("task.id", ondelete="CASCADE"), nullable=False)
    user_id = _sql.Column(_sql.Integer, _sql.ForeignKey("user.id"), nullable=False)
    comment = _sql.Column(_sql.Text, nullable=False)
    is_system_log = _sql.Column(_sql.Boolean, default=False)
    created_at = _sql.Column(_sql.DateTime(timezone=True), server_default=_sql.func.now())
    task = relationship("Task", back_populates="comments")
    author = relationship("User")

class TaskAttachment(_database.Base):
    __tablename__ = "task_attachment"
    id = _sql.Column(_sql.Integer, primary_key=True, index=True)
    task_id = _sql.Column(_sql.Integer, _sql.ForeignKey("task.id", ondelete="CASCADE"), nullable=False)
    uploader_id = _sql.Column(_sql.Integer, _sql.ForeignKey("user.id"), nullable=False)
    file_url = _sql.Column(_sql.String(500), nullable=False)
    file_name = _sql.Column(_sql.String(255), nullable=True)
    thumbnail_url = _sql.Column(_sql.String(500), nullable=True)
    file_size_mb = _sql.Column(_sql.Float, nullable=True)
    mime_type = _sql.Column(_sql.String(100), nullable=True)
    duration_seconds = _sql.Column(_sql.Integer, nullable=True)
    created_at = _sql.Column(_sql.DateTime(timezone=True), server_default=_sql.func.now())
    task = relationship("Task", back_populates="attachments")
    uploader = relationship("User")