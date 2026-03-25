from sqlalchemy.orm import Session, joinedload
from sqlalchemy import desc
from sqlalchemy.exc import SQLAlchemyError
from fastapi import HTTPException
from datetime import datetime
from typing import Optional

import app.lead.models as _models
import app.lead.schema as _schemas
import app.user.models as _user_models

def get_lead_or_404(db: Session, lead_id: int):
    lead = db.query(_models.Lead).options(
        joinedload(_models.Lead.created_by)
    ).filter(_models.Lead.id == lead_id).first()
    
    if not lead:
        raise HTTPException(status_code=404, detail=f"Lead {lead_id} not found")
    return lead

def create_lead(db: Session, lead_in: _schemas.LeadCreate, current_user: _user_models.User):
    try:
        new_lead = _models.Lead(
            name=lead_in.name,
            phone_number=lead_in.phone_number,
            email=lead_in.email,
            lead_source=lead_in.lead_source.value,
            lead_type=lead_in.lead_type.value,
            status=lead_in.status.value,
            description=lead_in.description,
            comment=lead_in.comment,
            created_by_id=current_user.id
        )
        db.add(new_lead)
        db.commit()
        db.refresh(new_lead)
        return new_lead
    except SQLAlchemyError as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to create lead: {str(e)}")

def update_lead(db: Session, lead_id: int, lead_in: _schemas.LeadUpdate):
    lead = get_lead_or_404(db, lead_id)
    try:
        update_data = lead_in.dict(exclude_unset=True)
        
        for key, value in update_data.items():
            if hasattr(value, 'value'):  # Unwrap Enums to strings for DB
                value = value.value
            setattr(lead, key, value)
            
        db.commit()
        db.refresh(lead)
        return lead
    except SQLAlchemyError as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to update lead: {str(e)}")

def delete_lead(db: Session, lead_id: int):
    lead = get_lead_or_404(db, lead_id)
    try:
        db.delete(lead)
        db.commit()
        return {"message": "Lead deleted successfully"}
    except SQLAlchemyError as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to delete lead: {str(e)}")

def get_all_leads(
    db: Session, 
    skip: int = 1, 
    limit: int = 20, 
    source: Optional[str] = None,
    type: Optional[str] = None,
    status: Optional[str] = None,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None
):
    try:
        query = db.query(_models.Lead).options(joinedload(_models.Lead.created_by))
        
        # Apply Filters
        if source:
            query = query.filter(_models.Lead.lead_source == source)
        if type:
            query = query.filter(_models.Lead.lead_type == type)
        if status:
            query = query.filter(_models.Lead.status == status)
        if start_date:
            query = query.filter(_models.Lead.created_at >= start_date)
        if end_date:
            query = query.filter(_models.Lead.created_at <= end_date)
            
        total_records = query.count()
        offset = (skip - 1) * limit
        
        leads = query.order_by(desc(_models.Lead.created_at))\
                     .offset(offset)\
                     .limit(limit)\
                     .all()
                     
        return {
            "total": total_records,
            "skip": skip,
            "limit": limit,
            "leads": leads
        }
    except SQLAlchemyError as e:
        raise HTTPException(status_code=500, detail=f"DB Error: {str(e)}")