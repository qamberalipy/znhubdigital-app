# app/Shared/dependencies.py
from typing import Annotated
from fastapi import Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session
import jwt
import os
from ..core.db import session as _database

# Try to import MENU
try:
    from app.core.menu import MENU
except ImportError:
    MENU = {"default": [], "admin": [], "staff": [], "doctor": []}

JWT_SECRET = os.getenv("JWT_SECRET", "secret")

class HTML_LoginRequired(Exception):
    pass

def get_db():
    db = _database.SessionLocal()
    try: yield db
    finally: db.close()

async def get_user(request: Request, db: Annotated[Session, Depends(get_db)]):
    return request.state.user

def get_menu_context(request: Request):
    """Reads cookie, extracts role, returns Menu List."""
    token = request.cookies.get("access_token")
    role = "default"
    if token:
        try:
            # We decode insecurely here just for UI rendering speed
            payload = jwt.decode(token, options={"verify_signature": False})
            role = payload.get("role", "default")
        except:
            pass 
    return MENU.get(role, MENU['default'])

# --- THE FIX IS HERE ---
def protected_view(request: Request):
    """
    1. Checks if Cookie exists.
    2. Decodes Token.
    3. SETS request.state.user (This was missing!)
    """
    token = request.cookies.get("access_token")
    if not token:
        raise HTML_LoginRequired()
    
    try:
        # Decode and Verify
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
        
        # --- CRITICAL LINE: POPULATE THE STATE ---
        request.state.user = payload
        
    except Exception:
        # If expired or invalid, force redirect to login
        raise HTML_LoginRequired()