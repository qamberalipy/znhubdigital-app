from typing import Optional, List
from pydantic import BaseModel
from datetime import datetime
from app.lead.models import LeadSource, LeadType, LeadStatus

class UserMinimal(BaseModel):
    id: int
    full_name: Optional[str] = None
    role: str
    class Config:
        orm_mode = True

class LeadCreate(BaseModel):
    name: str
    phone_number: Optional[str] = None
    email: Optional[str] = None
    lead_source: LeadSource
    lead_type: LeadType
    status: LeadStatus = LeadStatus.new
    description: Optional[str] = None
    comment: Optional[str] = None

class LeadUpdate(BaseModel):
    name: Optional[str] = None
    phone_number: Optional[str] = None
    email: Optional[str] = None
    lead_source: Optional[LeadSource] = None
    lead_type: Optional[LeadType] = None
    status: Optional[LeadStatus] = None
    description: Optional[str] = None
    comment: Optional[str] = None

class LeadOut(BaseModel):
    id: int
    name: str
    phone_number: Optional[str]
    email: Optional[str]
    lead_source: str
    lead_type: str
    status: str
    description: Optional[str]
    comment: Optional[str]
    created_at: datetime
    updated_at: Optional[datetime]
    
    created_by: Optional[UserMinimal]

    class Config:
        orm_mode = True

class PaginatedLeadResponse(BaseModel):
    total: int
    skip: int
    limit: int
    leads: List[LeadOut]