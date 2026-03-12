# app/notification/models.py
import sqlalchemy as _sql
from sqlalchemy.orm import relationship
import app.core.db.session as _database
from enum import Enum

# --- 1. Define Enums for Scalability ---
class NotificationSeverity(str, Enum):
    CRITICAL = "critical"  # Push + Email + SMS
    HIGH = "high"          # Push + Sound
    NORMAL = "normal"      # Silent Push
    LOW = "low"            # Feed only (no push)

class NotificationCategory(str, Enum):
    TASK = "task"
    DOC_SIGN = "document_signature"
    ANNOUNCEMENT = "announcement"
    SYSTEM = "system"
    INVOICE = "invoice"
    SOCIAL = "social"
    APPROVAL = "approval"

class Notification(_database.Base):
    __tablename__ = "notification"

    id = _sql.Column(_sql.Integer, primary_key=True, index=True)
    recipient_id = _sql.Column(_sql.Integer, _sql.ForeignKey("user.id"), nullable=False, index=True)
    actor_id = _sql.Column(_sql.Integer, _sql.ForeignKey("user.id"), nullable=True)
    
    title = _sql.Column(_sql.String(255), nullable=False)
    body = _sql.Column(_sql.Text, nullable=True)
    
    # --- 2. New Fields for Filtering & Priority ---
    category = _sql.Column(_sql.String(50), default=NotificationCategory.SYSTEM.value, index=True)
    severity = _sql.Column(_sql.String(20), default=NotificationSeverity.NORMAL.value)
    
    entity_type = _sql.Column(_sql.String(50), nullable=True) # e.g., "task", "invoice"
    entity_id = _sql.Column(_sql.Integer, nullable=True)
    click_action_link = _sql.Column(_sql.String(500), nullable=True)

    is_read = _sql.Column(_sql.Boolean, default=False, index=True) # Index added for "Unread" queries
    created_at = _sql.Column(_sql.DateTime(timezone=True), server_default=_sql.func.now(), index=True)

    recipient = relationship("User", foreign_keys=[recipient_id])
    actor = relationship("User", foreign_keys=[actor_id])

    # --- 3. Composite Index for Performance ---
    # Helps fast retrieval of "My Unread Notifications" sorted by date
    __table_args__ = (
        _sql.Index("ix_notif_recipient_read_created", "recipient_id", "is_read", "created_at"),
    )

class UserDevice(_database.Base):
    __tablename__ = "user_device"
    
    id = _sql.Column(_sql.Integer, primary_key=True, index=True)
    user_id = _sql.Column(_sql.Integer, _sql.ForeignKey("user.id"), nullable=False)
    fcm_token = _sql.Column(_sql.String(500), nullable=False, unique=True)
    platform = _sql.Column(_sql.String(20), default="android")
    
    updated_at = _sql.Column(_sql.DateTime(timezone=True), onupdate=_sql.func.now())