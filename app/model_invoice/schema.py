# app/model_invoice/schema.py
from pydantic import BaseModel, ConfigDict
from typing import Optional, List
from datetime import date, datetime

# --- Minimal User for Dropdowns/Tables ---
class UserMinimal(BaseModel):
    id: int
    full_name: Optional[str] = None
    username: Optional[str] = None
    profile_picture_url: Optional[str] = None
    
    model_config = ConfigDict(from_attributes=True)

# --- Invoice Base ---
class InvoiceBase(BaseModel):
    invoice_date: date
    subscription: float = 0.0
    tips: float = 0.0
    posts: float = 0.0
    messages: float = 0.0
    referrals: float = 0.0
    streams: float = 0.0
    others: float = 0.0

# --- CRUD Schemas ---
class InvoiceCreate(InvoiceBase):
    user_id: int

class InvoiceUpdate(InvoiceBase):
    # All fields optional for updates
    invoice_date: Optional[date] = None
    subscription: Optional[float] = None
    tips: Optional[float] = None
    posts: Optional[float] = None
    messages: Optional[float] = None
    referrals: Optional[float] = None
    streams: Optional[float] = None
    others: Optional[float] = None

# --- Responses ---
class InvoiceResponse(InvoiceBase):
    id: int
    user_id: int
    total_earnings: float  # Computed field
    user: Optional[UserMinimal] = None
    created_at: Optional[datetime] = None
    
    model_config = ConfigDict(from_attributes=True)

class PaginatedResponse(BaseModel):
    items: List[InvoiceResponse]
    total: int
    page: int
    size: int

class DailyStats(BaseModel):
    date: date
    total: float

class ReportSummary(BaseModel):
    total_revenue: float = 0.0
    total_subscription: float = 0.0
    total_tips: float = 0.0
    total_messages: float = 0.0
    total_posts: float = 0.0
    total_referrals: float = 0.0
    total_streams: float = 0.0
    total_others: float = 0.0

class ReportResponse(BaseModel):
    summary: ReportSummary
    daily_trend: List[DailyStats]
    records: List[InvoiceResponse]