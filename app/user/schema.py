# app/user/schema.py
from typing import Optional, List
from pydantic import BaseModel, EmailStr, validator
from datetime import datetime, date
from enum import Enum

class UserRoleEnum(str, Enum):
    admin = "admin"
    manager = "manager"
    team_member = "team_member"
    digital_creator = "digital_creator"

class GenderEnum(str, Enum):
    male = "Male"
    female = "Female"
    other = "Other"

# Mini schema for nested lists (Manager/Models)
class UserInList(BaseModel):
    id: int
    full_name: Optional[str] = None
    profile_picture_url: Optional[str] = None
    role: Optional[str] = None
    class Config: 
        orm_mode = True

class UserCreate(BaseModel):
    email: EmailStr
    username: str
    password: str
    role: UserRoleEnum
    
    # Relationships
    manager_id: Optional[int] = None
    assigned_model_id: Optional[int] = None  # For 1:1 (Staff <-> Model)
    assign_model_ids: Optional[List[int]] = [] # For Bulk Assign (Manager -> [Models])

    # Profile
    full_name: Optional[str] = None
    phone: Optional[str] = None
    gender: Optional[GenderEnum] = None

class UserUpdate(BaseModel):
    email: Optional[EmailStr] = None
    username: Optional[str] = None
    password: Optional[str] = None
    role: Optional[UserRoleEnum] = None
    
    # Relationships
    manager_id: Optional[int] = None
    assigned_model_id: Optional[int] = None
    assign_model_ids: Optional[List[int]] = None

    # Profile
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
    profile_picture_url: Optional[str] = None
    x_link: Optional[str] = None
    of_link: Optional[str] = None
    insta_link: Optional[str] = None

class UserOut(BaseModel):
    id: int
    username: Optional[str] = None
    email: Optional[str] = None
    full_name: Optional[str] = None
    role: Optional[str] = None
    account_status: Optional[str] = None
    
    # Hierarchy Data
    manager: Optional[UserInList] = None 
    assigned_model_rel: Optional[UserInList] = None 
    models_under_manager: List[UserInList] = [] 
    
    # Contact & Profile
    phone: Optional[str] = None
    mobile_number: Optional[str] = None
    profile_picture_url: Optional[str] = None
    bio: Optional[str] = None
    gender: Optional[GenderEnum] = None
    dob: Optional[date] = None
    
    # Address
    city: Optional[str] = None
    country_id: Optional[int] = None
    address_1: Optional[str] = None
    address_2: Optional[str] = None
    zipcode: Optional[str] = None

    # Social Links
    x_link: Optional[str] = None
    of_link: Optional[str] = None
    insta_link: Optional[str] = None

    # Flags & Timestamps
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