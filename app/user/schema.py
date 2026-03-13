# app/user/schema.py
from typing import Optional, List
from pydantic import BaseModel, EmailStr, validator
from datetime import datetime, date
from enum import Enum

class UserRoleEnum(str, Enum):
    admin = "admin"
    sale = "sale"
    lead_generator = "lead_generator"
    developer = "developer"
    client = "client"

class GenderEnum(str, Enum):
    male = "Male"
    female = "Female"
    other = "Other"

class UserCreate(BaseModel):
    email: EmailStr
    username: str
    password: str
    role: UserRoleEnum
    full_name: Optional[str] = None
    phone: Optional[str] = None
    gender: Optional[GenderEnum] = None
    timezone: Optional[str] = "Asia/Karachi"

class UserUpdate(BaseModel):
    email: Optional[EmailStr] = None
    username: Optional[str] = None
    password: Optional[str] = None
    role: Optional[UserRoleEnum] = None
    full_name: Optional[str] = None
    bio: Optional[str] = None
    gender: Optional[GenderEnum] = None
    dob: Optional[date] = None
    phone: Optional[str] = None
    mobile_number: Optional[str] = None
    country_id: Optional[int] = None
    city: Optional[str] = None
    zipcode: Optional[str] = None
    address_1: Optional[str] = None
    address_2: Optional[str] = None
    timezone: Optional[str] = None
    profile_picture_url: Optional[str] = None

class UserOut(BaseModel):
    id: int
    username: Optional[str] = None
    email: Optional[str] = None
    full_name: Optional[str] = None
    role: Optional[str] = None
    account_status: Optional[str] = None
    phone: Optional[str] = None
    mobile_number: Optional[str] = None
    profile_picture_url: Optional[str] = None
    bio: Optional[str] = None
    gender: Optional[GenderEnum] = None
    timezone: Optional[str] = None
    dob: Optional[date] = None
    city: Optional[str] = None
    country_id: Optional[int] = None
    address_1: Optional[str] = None
    address_2: Optional[str] = None
    zipcode: Optional[str] = None
    is_onboarded: bool
    created_at: Optional[datetime] = None
    last_login: Optional[datetime] = None

    class Config:
        orm_mode = True

class ChangePassword(BaseModel):
    old_password: str
    new_password: str
    confirm_password: str
    @validator('confirm_password')
    def passwords_match(cls, v, values):
        if 'new_password' in values and v != values['new_password']:
            raise ValueError('Passwords do not match')
        return v

# --- SHIFT SCHEMAS ---
class ShiftStatusOut(BaseModel):
    is_active: bool
    shift_id: Optional[int] = None
    start_time: Optional[datetime] = None

class ShiftActionOut(BaseModel):
    message: str
    shift_id: Optional[int] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    total_hours: Optional[float] = None