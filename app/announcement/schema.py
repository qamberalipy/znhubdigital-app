# app/announcement/schema.py
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
from app.user.models import UserRole

# --- Helpers ---
class AuthorShort(BaseModel):
    id: int
    full_name: Optional[str]
    role: UserRole
    profile_picture_url: Optional[str]

    class Config:
        from_attributes = True

# --- Request Schemas ---
class AttachmentCreate(BaseModel):
    file_url: str
    file_type: str
    mime_type: str
    file_size_mb: float
    thumbnail_url: Optional[str] = None

class AnnouncementCreate(BaseModel):
    content: Optional[str] = None
    attachments: List[AttachmentCreate] = []

class ReactionCreate(BaseModel):
    emoji: str

# --- Response Schemas ---
class AttachmentResponse(AttachmentCreate):
    id: int
    class Config:
        from_attributes = True

class ReactionResponse(BaseModel):
    user_id: int
    emoji: str
    class Config:
        from_attributes = True

class ViewerResponse(BaseModel):
    user_id: int
    viewed_at: datetime
    user: AuthorShort # Nest the user info who viewed it
    class Config:
        from_attributes = True

class AnnouncementResponse(BaseModel):
    id: int
    content: Optional[str]
    
    # Author Info (Nested)
    author: AuthorShort
    
    # URL Preview
    link_url: Optional[str]
    link_title: Optional[str]
    link_description: Optional[str]
    link_image: Optional[str]
    
    created_at: datetime
    
    # Related Data
    attachments: List[AttachmentResponse]
    reactions: List[ReactionResponse]
    view_count: int  # Total views

    class Config:
        from_attributes = True