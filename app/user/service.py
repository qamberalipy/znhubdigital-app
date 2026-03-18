# app/user/service.py
from typing import Optional, List
from datetime import datetime, timezone
from zoneinfo import ZoneInfo
from fastapi import HTTPException, status
import sqlalchemy.orm as _orm
from sqlalchemy import or_
from sqlalchemy.exc import IntegrityError

import datetime as _dt
from calendar import monthrange
import app.user.models as _models
import app.user.schema as _schemas
import app.core.db.session as _database

def get_db():
    db = _database.SessionLocal()
    try:
        yield db
    finally:
        db.close()

def check_email_exists(db: _orm.Session, email: str) -> bool:
    return db.query(_models.User).filter(_models.User.email == email, _models.User.is_deleted == False).first() is not None

def check_username_available(db: _orm.Session, username: str) -> bool:
    return db.query(_models.User).filter(_models.User.username == username, _models.User.is_deleted == False).first() is None

def get_user_by_id(db: _orm.Session, user_id: int) -> Optional[_models.User]:
    return db.query(_models.User).filter(_models.User.id == user_id, _models.User.is_deleted == False).first()

# --- USER CRUD ---
def create_user(db: _orm.Session, user_in: _schemas.UserCreate) -> _models.User:
    if check_email_exists(db, user_in.email):
        raise HTTPException(status_code=400, detail="Email already exists")
    if not check_username_available(db, user_in.username):
        raise HTTPException(status_code=400, detail="Username already taken")

    try:
        user_data = user_in.dict(exclude={"password"})
        db_user = _models.User(**user_data, created_at=datetime.now(timezone.utc), is_onboarded=True)
        db_user.set_password(user_in.password)

        db.add(db_user)
        db.commit()
        db.refresh(db_user)
        return db_user
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Database constraint error.")

# Add this to the bottom of app/user/service.py


# Update your existing update_user function to look like this:
def update_user(db: _orm.Session, user_id: int, user_in: _schemas.UserUpdate, current_user: _models.User) -> _models.User:
    user = get_user_by_id(db, user_id)
    if not user: raise HTTPException(status_code=404, detail="User not found")

    try:
        update_data = user_in.dict(exclude_unset=True)
        
        # Security: If a regular employee is updating their own profile, 
        # prevent them from promoting themselves to admin or changing account status.
        if current_user.role != _models.UserRole.admin:
            update_data.pop("role", None)
            update_data.pop("account_status", None)

        if "password" in update_data:
            user.set_password(update_data.pop("password"))
        
        for key, value in update_data.items():
            if hasattr(user, key):
                setattr(user, key, value)

        db.commit()
        db.refresh(user)
        return user
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Update failed. Username or Email may already exist.")

def soft_delete_user(db: _orm.Session, user_id: int) -> bool:
    user = get_user_by_id(db, user_id)
    if not user: raise HTTPException(status_code=404, detail="User not found")
    
    try:
        timestamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
        user.email = f"{user.email}_del_{timestamp}"
        if user.username:
            user.username = f"{user.username}_del_{timestamp}"
        
        user.is_deleted = True
        user.account_status = _models.AccountStatus.deleted
        
        db.commit()
        return True
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to delete user")

def get_all_users(db: _orm.Session, role=None, search=None, skip=0, limit=100, exclude_user_id: Optional[int] = None):
    query = db.query(_models.User).filter(_models.User.is_deleted == False)
    
    if exclude_user_id:
        query = query.filter(_models.User.id != exclude_user_id)
        
    if role: 
        query = query.filter(_models.User.role == role)
    if search:
        s = f"%{search}%"
        query = query.filter(or_(_models.User.full_name.ilike(s), _models.User.email.ilike(s)))
    
    return query.offset(skip).limit(limit).all()

# --- SHIFT SERVICES ---
def get_active_shift(db: _orm.Session, user_id: int) -> Optional[_models.ShiftLog]:
    return db.query(_models.ShiftLog).filter(
        _models.ShiftLog.user_id == user_id,
        _models.ShiftLog.end_time.is_(None)
    ).first()

# app/user/service.py
# ... [keep existing imports]

# 1. Update your `start_user_shift` function to handle the midnight edge case
def start_user_shift(db: _orm.Session, user: _models.User) -> _models.ShiftLog:
    if get_active_shift(db, user.id):
        raise HTTPException(status_code=400, detail="A shift is already active.")

    now_utc = datetime.now(timezone.utc)
    
    # Calculate logical shift date based on user's timezone
    user_tz_str = user.timezone or "UTC"
    try:
        user_tz = ZoneInfo(user_tz_str)
    except Exception:
        user_tz = timezone.utc 

    local_time = now_utc.astimezone(user_tz)
    logical_shift_date = local_time.date()

    # --- MIDNIGHT SHIFT EDGE CASE FIX ---
    # If the user clocks in late at night (e.g., 8:00 PM / 20:00 or later), 
    # the shift logically belongs to the next day's roster.
    if local_time.hour >= 20:
        logical_shift_date += _dt.timedelta(days=1)

    new_shift = _models.ShiftLog(
        user_id=user.id,
        shift_date=logical_shift_date,
        start_time=now_utc
    )
    db.add(new_shift)
    db.commit()
    db.refresh(new_shift)
    return new_shift


# 2. Add this new function at the bottom of the file
def get_user_attendance(db: _orm.Session, user_id: int, start_date: Optional[_dt.date] = None, end_date: Optional[_dt.date] = None):
    user = get_user_by_id(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Default to current month if dates are not provided
    today = _dt.date.today()
    if not start_date:
        start_date = today.replace(day=1)
    if not end_date:
        _, last_day = monthrange(today.year, today.month)
        end_date = today.replace(day=last_day)

    records = db.query(_models.ShiftLog).filter(
        _models.ShiftLog.user_id == user_id,
        _models.ShiftLog.shift_date >= start_date,
        _models.ShiftLog.shift_date <= end_date
    ).order_by(_models.ShiftLog.shift_date.asc(), _models.ShiftLog.start_time.asc()).all()

    cumulative_hours = sum([r.total_hours for r in records if r.total_hours])

    return {
        "user_id": user_id,
        "start_date": start_date,
        "end_date": end_date,
        "records": records,
        "cumulative_hours": round(cumulative_hours, 2)
    }

def end_user_shift(db: _orm.Session, user_id: int) -> _models.ShiftLog:
    shift = get_active_shift(db, user_id)
    if not shift:
        raise HTTPException(status_code=400, detail="No active shift found to end.")

    shift.end_time = datetime.now(timezone.utc)
    
    # Calculate total hours crossing midnight easily
    duration = shift.end_time - shift.start_time
    shift.total_hours = round(duration.total_seconds() / 3600.0, 2)
    
    db.commit()
    db.refresh(shift)
    return shift

def change_user_password(db: _orm.Session, user_id: int, password_data: _schemas.ChangePassword):
    user = get_user_by_id(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if not user.verify_password(password_data.old_password):
        raise HTTPException(status_code=400, detail="Incorrect old password")

    try:
        user.set_password(password_data.new_password)
        # Using the timezone-aware UTC approach we set up earlier
        user.updated_at = datetime.now(timezone.utc)
        db.commit()
        return {"message": "Password updated successfully"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to update password")