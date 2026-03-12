# app/core/main_router.py
from datetime import datetime, timedelta
from typing import List, Optional
import logging

# Added 'Response' to imports
from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks, Response
from sqlalchemy.orm import Session
import app.Shared.helpers as _helpers
from app.Shared import schema as _shared_schemas
from app.Shared import service as _services

logger = logging.getLogger("uvicorn.error")
router = APIRouter(prefix="/api")

# Rate Limiting
login_attempts = {}
LOCKOUT_THRESHOLD = 5
LOCKOUT_DURATION_SECONDS = 30 * 60

@router.get("/healthcheck", status_code=200)
def healthcheck():
    return {"status": "healthy"}

# --- AUTHENTICATION ---

@router.post("/auth/login", response_model=_shared_schemas.AuthLoginResp, tags=["Auth"])
def login(
    response: Response,  # <--- INJECT RESPONSE OBJECT
    payload: _shared_schemas.LoginReq, 
    db: Session = Depends(_services.get_db)
):
    # 1. Lockout Check
    attempts = login_attempts.get(payload.email, {"count": 0, "locked_until": None})
    if attempts.get("locked_until") and attempts["locked_until"] > datetime.utcnow():
        raise HTTPException(status_code=403, detail="Account locked due to multiple failed attempts")

    try:
        # 2. Perform Login
        user, access_token, refresh_token = _services.login_with_email(db, payload.email, payload.password)
        
        # 3. Success - Reset attempts
        login_attempts.pop(payload.email, None)
        
        # --- NEW: SET COOKIE FOR WEB DASHBOARD ---
        # app/core/main_router.py

        response.set_cookie(
            key="access_token",
            value=access_token,
            httponly=True,
            max_age=180000,
            samesite="lax",
            secure=False,
            path="/"  # <--- ADD THIS LINE
        )
        # -----------------------------------------
        
        return {
            "message": "Login successful", 
            "access_token": access_token, 
            "refresh_token": refresh_token, 
            "user": user
        }
    except HTTPException as e:
        print(f"Login failed for {payload.email}: {e.detail}")
        # 4. Failure - Increment attempts
        attempts = login_attempts.setdefault(payload.email, {"count": 0, "locked_until": None})
        attempts["count"] += 1
        if attempts["count"] >= LOCKOUT_THRESHOLD:
            attempts["locked_until"] = datetime.utcnow() + timedelta(seconds=LOCKOUT_DURATION_SECONDS)
        raise e

@router.post("/auth/refresh", tags=["Auth"])
def refresh(payload: _shared_schemas.RefreshReq, db: Session = Depends(_services.get_db)):
    try:
        new_access = _services.refresh_access_token(db, payload.refresh_token)
        return {"access_token": new_access}
    except Exception as e:
        raise HTTPException(status_code=401, detail="Invalid token")

@router.post("/auth/logout", tags=["Auth"])
def logout(
    response: Response, # <--- INJECT RESPONSE TO DELETE COOKIE
    payload: Optional[_shared_schemas.RefreshReq] = None, 
    db: Session = Depends(_services.get_db)
):
    token = payload.refresh_token if payload else None
    _services.logout_user(db, refresh_token=token)
    
    # --- NEW: Clear Cookie ---
    response.delete_cookie("access_token", path="/")
    
    return {"message": "Logged out"}


@router.post("/auth/forgot-password", tags=["Auth"])
def forgot_password(
    payload: _shared_schemas.ForgotPasswordReq, 
    background_tasks: BackgroundTasks, 
    db: Session = Depends(_services.get_db)):
    user = _services.get_user_by_email(db, payload.email)
    
    # --- CHANGE: Raise Error if User Not Found ---
    if not user:
        raise HTTPException(
            status_code=404, 
            detail="User not found with this email"
        )
        
    otp = _helpers.create_otp()
    _services.save_otp(db, payload.email, otp, purpose="reset")
    
    subject = "Password Reset Request"
    html_text = f"Your OTP for password reset is: <strong>{otp}</strong>. Valid for 5 minutes."
    background_tasks.add_task(_helpers.send_email, payload.email, subject, html_text, otp)
    
    return {"message": "OTP sent successfully"}

@router.post("/auth/reset-password", tags=["Auth"])
def reset_password(payload: _shared_schemas.ResetPasswordReq, db: Session = Depends(_services.get_db)):
    _services.reset_password_using_otp(db, payload.email, payload.otp, payload.new_password)
    return {"message": "Password reset successful"}

@router.post("/admin/create-user", response_model=_shared_schemas.UserOut, tags=["Admin"])
def create_user(
    payload: _shared_schemas.CreateUserReq, 
    db: Session = Depends(_services.get_db)
):
    new_user = _services.create_user_by_admin(db, payload)
    return new_user

@router.get("/countries", response_model=List[_shared_schemas.CountryOut], tags=["Misc"])
def read_countries(db: Session = Depends(_services.get_db)):
    countries = _services.get_all_countries(db)
    if not countries:
        return []
    return countries