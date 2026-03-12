# app/model_invoice/model_invoice.py
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from typing import Optional, List
from datetime import date

from app.core.db.session import SessionLocal
import app.user.user as _user_auth
from app.user.models import User, UserRole

import app.model_invoice.schema as _schemas
import app.model_invoice.service as _services

router = APIRouter()

# --- Dependencies ---
def get_db():
    db = SessionLocal()
    try: yield db
    finally: db.close()

def require_manager_or_admin(current_user: User = Depends(_user_auth.get_current_user)):
    if current_user.role not in [UserRole.admin, UserRole.manager]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, 
            detail="Insufficient permissions. Admin or Manager access required."
        )
    return current_user

# --- Routes ---

@router.get("/creators", response_model=List[_schemas.UserMinimal], tags=["INVOICE API"])
def get_creators_list(
    db: Session = Depends(get_db),
    current_user: User = Depends(_user_auth.get_current_user)
):
    """
    Fetch all users with 'digital_creator' role for the dropdown.
    """
    return db.query(User).filter(User.role == UserRole.digital_creator).all()

@router.get("/", response_model=_schemas.PaginatedResponse, tags=["INVOICE API"])
def list_invoices(
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=100),
    user_id: Optional[int] = Query(None, description="Filter by Creator ID"),
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(_user_auth.get_current_user)
):
    # Security: If user is a Creator, force filter to their own ID
    if current_user.role == UserRole.digital_creator:
        user_id = current_user.id

    items, total = _services.get_all_invoices(
        db=db, 
        page=page, 
        limit=limit, 
        user_id=user_id, 
        date_from=date_from, 
        date_to=date_to
    )
    
    return {
        "items": items,
        "total": total,
        "page": page,
        "size": limit
    }

@router.post("/", response_model=_schemas.InvoiceResponse, status_code=status.HTTP_201_CREATED, tags=["INVOICE API"])
def create_invoice(
    invoice_in: _schemas.InvoiceCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_manager_or_admin)
):
    # Validate User Existence
    user = db.query(User).filter(User.id == invoice_in.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Selected Creator not found.")
        
    return _services.create_invoice(db, invoice_in)

@router.put("/{invoice_id}", response_model=_schemas.InvoiceResponse, tags=["INVOICE API"])
def update_invoice(
    invoice_id: int,
    updates: _schemas.InvoiceUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_manager_or_admin)
):
    updated_obj = _services.update_invoice(db, invoice_id, updates)
    if not updated_obj:
        raise HTTPException(status_code=404, detail="Invoice record not found.")
    return updated_obj

@router.delete("/{invoice_id}", status_code=status.HTTP_204_NO_CONTENT, tags=["INVOICE API"])
def delete_invoice(
    invoice_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_manager_or_admin)
):
    success = _services.delete_invoice(db, invoice_id)
    if not success:
        raise HTTPException(status_code=404, detail="Invoice record not found.")
    return None


@router.get("/report", response_model=_schemas.ReportResponse, tags=["INVOICE API"])
def get_model_report(
    user_id: int,
    date_from: date,
    date_to: date,
    db: Session = Depends(get_db),
    current_user: User = Depends(_user_auth.get_current_user)
):
    """
    Get aggregated report, graph data, and records for a specific user and date range.
    """
    # Security check: if creator, can only view own report
    if current_user.role == UserRole.digital_creator and current_user.id != user_id:
        raise HTTPException(status_code=403, detail="Unauthorized")

    return _services.get_creator_report(db, user_id, date_from, date_to)