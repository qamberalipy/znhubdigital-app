from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from typing import Optional
from datetime import date

import app.core.db.session as _database
import app.user.user as _user_auth
import app.user.models as _user_models
import app.content_vault.schema as _schemas
import app.content_vault.service as _services

router = APIRouter()

def get_db():
    db = _database.SessionLocal()
    try: yield db
    finally: db.close()

# --- 1. Root: Get Folders (Users) ---
@router.get("/folders", response_model=_schemas.FolderListResponse, tags=["CONTENT VAULT"])
def get_drive_folders(
    current_user: _user_models.User = Depends(_user_auth.get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get list of 'Folders'. Each folder represents a User who has uploaded content.
    - Admin sees all.
    - Manager sees their team.
    - Creator sees themselves.
    """
    folders = _services.get_vault_folders(db, current_user)
    return {"folders": folders}

# --- 2. Files: Get Content inside a Folder ---
@router.get("/files/{user_id}", response_model=_schemas.PaginatedVaultResponse, tags=["CONTENT VAULT"])
def get_drive_files(
    user_id: int,
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    media_type: Optional[str] = Query(None, enum=["image", "video", "document"], description="Filter by file type"),
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    current_user: _user_models.User = Depends(_user_auth.get_current_user),
    db: Session = Depends(get_db)
):
    """
    View files inside a specific user's folder.
    Supports filtering by Date and Media Type.
    """
    return _services.get_vault_files(
        db=db,
        current_user=current_user,
        target_user_id=user_id,
        skip=skip,
        limit=limit,
        media_type=media_type,
        date_from=date_from,
        date_to=date_to
    )