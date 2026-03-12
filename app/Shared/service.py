# app/Shared/service.py
from datetime import datetime, timedelta
from typing import Optional, Tuple, List
import sqlalchemy.orm as _orm
from fastapi import HTTPException
import app.user.models as _models
import app.Shared.schema as _schemas
import app.core.db.session as _database
from app.Shared import helpers as _helpers

# DB dependency
def get_db():
    db = _database.SessionLocal()
    try:
        yield db
    finally:
        db.close()

# ============================================================================
#  HELPERS
# ============================================================================

def get_user_by_email(db: _orm.Session, email: str) -> Optional[_models.User]:
    return db.query(_models.User).filter(_models.User.email == email, _models.User.is_deleted == False).first()

def save_otp(db: _orm.Session, email: str, otp: str, purpose: str = "verify") -> _models.OTP:
    # Invalidate previous OTPs for this purpose
    previous_otps = db.query(_models.OTP).filter(
        _models.OTP.email == email, 
        _models.OTP.purpose == purpose, 
        _models.OTP.used == False
    ).all()
    for prev in previous_otps:
        prev.used = True
    
    record = _models.OTP(email=email, otp=otp, purpose=purpose)
    db.add(record)
    db.commit()
    db.refresh(record)
    return record

def verify_otp(db: _orm.Session, email: str, otp_value: str, purpose: str = "verify", expiry_seconds: int = 15 * 60) -> bool:
    record = (
        db.query(_models.OTP)
        .filter(_models.OTP.email == email, _models.OTP.purpose == purpose, _models.OTP.used == False)
        .order_by(_models.OTP.created_at.desc())
        .first()
    )
    if not record:
        return False
    age = datetime.utcnow() - record.created_at
    if record.otp == otp_value and age.total_seconds() <= expiry_seconds:
        record.used = True
        db.add(record)
        db.commit()
        return True
    return False

# ============================================================================
#  CORE AUTH LOGIC
# ============================================================================

def login_with_email(db: _orm.Session, email: str, password: str):
    user = get_user_by_email(db, email)
    
    if not user:
        raise HTTPException(status_code=400, detail="Invalid credentials")
    
    # Check Account Status
    if user.account_status != _models.AccountStatus.active:
        raise HTTPException(status_code=403, detail=f"Account is {user.account_status}")

    if not user.password_hash or not user.verify_password(password):
        raise HTTPException(status_code=400, detail="Invalid credentials")
    
    # --- FIX START: Create Dictionary Payload for Token ---

    token_data = {
        "sub": str(user.id),
        "user_id": user.id,
        "role": user.role.value if hasattr(user.role, 'value') else user.role,
        "email": user.email,
        "name": user.full_name or user.username,  # <--- NEW
        "picture": user.profile_picture_url       # <--- NEW
    }
    print(f"Token data being used: {token_data}")  # Debug print
    # Pass Dictionary (not int) to helpers
    access_token = _helpers.create_access_token(data=token_data)
    # --- FIX END ---

    refresh_token = _helpers.create_refresh_token(user.id)
    
    # Save Refresh Token
    rt = _models.RefreshToken(user_id=user.id, token=refresh_token)
    db.add(rt)
    
    # Update Stats
    user.last_login = datetime.utcnow()
    db.add(user)
    db.commit()
    db.refresh(user)
    
    return user, access_token, refresh_token

def create_user_by_admin(db: _orm.Session, payload: _schemas.CreateUserReq) -> _models.User:
    """
    Admin/Manager creates a user directly.
    """
    if get_user_by_email(db, payload.email):
        raise HTTPException(status_code=400, detail="Email already registered")

    new_user = _models.User(
        email=payload.email,
        full_name=payload.full_name,
        role=payload.role,
        gender=payload.gender,
        phone=payload.phone,
        city=payload.city,
        country_id=payload.country_id,
        # timezone=payload.timezone, # Uncomment if in schema
        is_onboarded=False,
        account_status=_models.AccountStatus.active,
        created_at=datetime.utcnow()
    )
    
    new_user.set_password(payload.password)
    
    if payload.dob:
        try:
            # Handle date conversion if payload.dob is string, or assign directly if date
            if isinstance(payload.dob, str):
                new_user.dob = datetime.strptime(payload.dob, "%Y-%m-%d").date()
            else:
                new_user.dob = payload.dob
        except ValueError:
            pass 

    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user

# ============================================================================
#  PASSWORD MANAGEMENT
# ============================================================================

def reset_password_using_otp(db: _orm.Session, email: str, otp_value: str, new_password: str):
    if not verify_otp(db, email, otp_value, purpose="reset"):
        raise HTTPException(status_code=400, detail="Invalid or expired OTP")

    user = get_user_by_email(db, email)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.set_password(new_password)
    db.add(user)
    db.commit()
    return True

# ============================================================================
#  TOKEN MANAGEMENT
# ============================================================================

def refresh_access_token(db: _orm.Session, refresh_token: str) -> str:
    record = db.query(_models.RefreshToken).filter(
        _models.RefreshToken.token == refresh_token,
        _models.RefreshToken.revoked == False
    ).first()
    
    if not record:
        raise HTTPException(status_code=401, detail="Invalid refresh token")
    
    payload = _helpers.decode_token(refresh_token)
    if not payload or payload.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="Invalid token type")
    
    user_id = payload.get("sub")
    
    # Fetch user to get current role/email for the new token
    user = db.query(_models.User).filter(_models.User.id == int(user_id)).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    # --- FIX START: Create Dictionary Payload for Token ---

    token_data = {
        "sub": str(user.id),
        "user_id": user.id,
        "role": user.role.value if hasattr(user.role, 'value') else user.role,
        "email": user.email,
        "name": user.full_name or user.username,  # <--- NEW
        "picture": user.profile_picture_url       # <--- NEW
    }
    return _helpers.create_access_token(data=token_data)
    # --- FIX END ---

def logout_user(db: _orm.Session, refresh_token: Optional[str] = None) -> bool:
    if refresh_token:
        record = db.query(_models.RefreshToken).filter(_models.RefreshToken.token == refresh_token).first()
        if record:
            record.revoked = True
            db.add(record)
            db.commit()
    return True

def get_all_countries(db: _orm.Session):
    return db.query(_models.Country).filter(_models.Country.is_deleted == False).all()