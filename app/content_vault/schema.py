from typing import Optional, List
from pydantic import BaseModel
from datetime import datetime

# --- Helpers ---
class UserFolder(BaseModel):
    """Represents a 'Folder' in the Drive view (A User)"""
    id: int
    full_name: Optional[str] = None
    username: Optional[str] = None
    profile_picture_url: Optional[str] = None
    role: str
    file_count: int = 0
    
    class Config:
        from_attributes = True

class TaskReference(BaseModel):
    """Minimal Task info to contextually link the file"""
    id: int
    title: str
    
    class Config:
        from_attributes = True

class VaultFileOut(BaseModel):
    """Represents a File inside the Vault"""
    id: int
    file_url: str
    file_name: Optional[str] = None # Added field
    thumbnail_url: Optional[str] = None
    file_size_mb: Optional[float] = None
    mime_type: Optional[str] = None
    
    # Derived from mime_type (image, video, document)
    media_type: str 
    
    # Backwards compatibility fields for frontend
    content_type: Optional[str] = "Attachment" 
    tags: Optional[str] = None
    
    created_at: datetime
    
    # Link to the original task
    task: Optional[TaskReference] = None

    class Config:
        from_attributes = True

# --- Responses ---
class FolderListResponse(BaseModel):
    folders: List[UserFolder]

class PaginatedVaultResponse(BaseModel):
    total: int
    skip: int
    limit: int
    data: List[VaultFileOut]