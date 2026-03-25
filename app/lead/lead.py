from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from typing import Optional
from datetime import datetime

import app.core.db.session as _database
import app.user.user as _user_auth
import app.user.models as _user_models
import app.lead.schema as _schemas
import app.lead.service as _services

router = APIRouter(tags=["LEADS API"])

def get_db():
    db = _database.SessionLocal()
    try: yield db
    finally: db.close()

@router.post("/", response_model=_schemas.LeadOut)
def create_lead(
    lead_in: _schemas.LeadCreate,
    current_user: _user_models.User = Depends(_user_auth.get_current_user),
    db: Session = Depends(get_db)
):
    return _services.create_lead(db, lead_in, current_user)

@router.get("/", response_model=_schemas.PaginatedLeadResponse)
def get_leads(
    skip: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    source: Optional[str] = None,
    type: Optional[str] = None,
    status: Optional[str] = None,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    current_user: _user_models.User = Depends(_user_auth.get_current_user),
    db: Session = Depends(get_db)
):
    return _services.get_all_leads(
        db=db, skip=skip, limit=limit, 
        source=source, type=type, status=status,
        start_date=start_date, end_date=end_date
    )

@router.get("/{lead_id}", response_model=_schemas.LeadOut)
def get_lead(
    lead_id: int,
    current_user: _user_models.User = Depends(_user_auth.get_current_user),
    db: Session = Depends(get_db)
):
    return _services.get_lead_or_404(db, lead_id)

@router.put("/{lead_id}", response_model=_schemas.LeadOut)
def update_lead(
    lead_id: int,
    lead_in: _schemas.LeadUpdate,
    current_user: _user_models.User = Depends(_user_auth.get_current_user),
    db: Session = Depends(get_db)
):
    return _services.update_lead(db, lead_id, lead_in)

@router.delete("/{lead_id}")
def delete_lead(
    lead_id: int,
    current_user: _user_models.User = Depends(_user_auth.get_current_user),
    db: Session = Depends(get_db)
):
    return _services.delete_lead(db, lead_id)