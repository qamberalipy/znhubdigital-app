from fastapi import APIRouter, Depends, HTTPException, status, Query, Request, BackgroundTasks
from sqlalchemy.orm import Session
from typing import List, Optional

import app.core.db.session as _database
import app.user.user as _user_auth
import app.user.models as _user_models
import app.signature.schema as _schemas
import app.signature.service as _services

router = APIRouter()

def get_db():
    db = _database.SessionLocal()
    try: yield db
    finally: db.close()

# --- Signature CRUD ---

@router.get("/", response_model=_schemas.PaginatedSignatureResponse, tags=["SIGNATURE API"])
def list_signatures(
    skip: int = Query(0, ge=0),
    limit: int = Query(10, ge=1, le=100),
    status: Optional[str] = None,
    search: Optional[str] = None,
    current_user: _user_models.User = Depends(_user_auth.get_current_user),
    db: Session = Depends(get_db)
):
    """
    List signature requests with pagination (skip/limit).
    """
    return _services.get_all_signature_requests(
        db=db, 
        current_user=current_user,
        skip=skip, 
        limit=limit, 
        status=status,
        search=search
    )

@router.post("/", response_model=_schemas.SignatureOut, status_code=status.HTTP_201_CREATED, tags=["SIGNATURE API"])
def create_signature_request(
    request_in: _schemas.SignatureCreate,
    background_tasks: BackgroundTasks, # <--- Added
    current_user: _user_models.User = Depends(_user_auth.get_current_user),
    db: Session = Depends(get_db)
):
    """Create a new signature request."""
    return _services.create_signature_request(db, request_in, current_user, background_tasks)

@router.get("/{id}", response_model=_schemas.SignatureOut, tags=["SIGNATURE API"])
def get_signature_request(
    id: int,
    current_user: _user_models.User = Depends(_user_auth.get_current_user),
    db: Session = Depends(get_db)
):
    """Get details of a specific request."""
    return _services.get_signature_request(db, id, current_user)

@router.put("/{id}", response_model=_schemas.SignatureOut, tags=["SIGNATURE API"])
def update_signature_request(
    id: int,
    updates: _schemas.SignatureUpdate,
    current_user: _user_models.User = Depends(_user_auth.get_current_user),
    db: Session = Depends(get_db)
):
    """Update request details (if not signed yet)."""
    return _services.update_signature_request(db, id, updates, current_user)

@router.delete("/{id}", status_code=status.HTTP_200_OK, tags=["SIGNATURE API"])
def delete_signature_request(
    id: int,
    background_tasks: BackgroundTasks, # <--- Added
    current_user: _user_models.User = Depends(_user_auth.get_current_user),
    db: Session = Depends(get_db)
):
    """Delete a request (if not signed yet)."""
    return _services.delete_signature_request(db, id, current_user, background_tasks)

# --- Action: Sign Document ---

@router.post("/{id}/sign", response_model=_schemas.SignatureOut, tags=["SIGNATURE API"])
def sign_document(
    id: int,
    sign_in: _schemas.SignatureSign,
    request: Request,
    background_tasks: BackgroundTasks, # <--- Added
    current_user: _user_models.User = Depends(_user_auth.get_current_user),
    db: Session = Depends(get_db)
):
    """Digital Creator signs the document."""
    client_ip = request.client.host
    return _services.sign_document(db, id, sign_in, current_user, client_ip, background_tasks)