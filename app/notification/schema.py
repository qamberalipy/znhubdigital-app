# app/notification/schema.py
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
from app.notification.models import NotificationCategory, NotificationSeverity

class DeviceTokenCreate(BaseModel):
    token: str
    platform: str = "android"

class NotificationBase(BaseModel):
    title: str
    body: Optional[str] = None
    category: NotificationCategory = NotificationCategory.SYSTEM
    severity: NotificationSeverity = NotificationSeverity.NORMAL
    click_action_link: Optional[str] = None
    entity_type: Optional[str] = None
    entity_id: Optional[int] = None

class NotificationResponse(NotificationBase):
    id: int
    recipient_id: int
    actor_id: Optional[int] = None
    is_read: bool
    created_at: datetime

    class Config:
        orm_mode = True

class UnreadCount(BaseModel):
    count: int

# --- New Schema for Pagination ---
class PaginatedNotificationResponse(BaseModel):
    total_unread: int
    items: List[NotificationResponse]
    next_cursor: Optional[str] = None  # For future infinite scroll implementation