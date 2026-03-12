from typing import Optional, List
from pydantic import BaseModel
from datetime import datetime
# We keep the import for possible future validation, but generally use str in models
from app.signature.models import SignatureStatus 

# --- Helpers ---
class UserMinimal(BaseModel):
    id: int
    full_name: Optional[str] = None
    username: Optional[str] = None
    profile_picture_url: Optional[str] = None
    role: str
    class Config:
        from_attributes = True

# --- Signature Schemas ---

class SignatureCreate(BaseModel):
    title: str
    description: Optional[str] = None
    document_url: str
    signer_id: int
    deadline: Optional[datetime] = None

class SignatureUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    document_url: Optional[str] = None
    deadline: Optional[datetime] = None

class SignatureSign(BaseModel):
    legal_name: str

class SignatureOut(BaseModel):
    id: int
    title: str
    description: Optional[str]
    document_url: str
    status: str
    
    deadline: Optional[datetime]
    signed_legal_name: Optional[str]
    signed_at: Optional[datetime]
    signer_ip_address: Optional[str]

    created_at: datetime

    updated_at: Optional[datetime] 

    requester: UserMinimal
    signer: UserMinimal

    class Config:
        from_attributes = True

# --- Pagination Response ---
class PaginatedSignatureResponse(BaseModel):
    total: int
    skip: int
    limit: int
    data: List[SignatureOut]