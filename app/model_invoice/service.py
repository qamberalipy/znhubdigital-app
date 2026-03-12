# app/model_invoice/service.py
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import desc
from typing import Optional, List, Tuple
from datetime import date

from app.model_invoice.models import ModelInvoice
from app.model_invoice.schema import InvoiceCreate, InvoiceUpdate, DailyStats, ReportSummary

def get_all_invoices(
    db: Session,
    page: int,
    limit: int,
    user_id: Optional[int] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None
) -> Tuple[List[ModelInvoice], int]:
    
    query = db.query(ModelInvoice)

    if user_id:
        query = query.filter(ModelInvoice.user_id == user_id)
    if date_from:
        query = query.filter(ModelInvoice.invoice_date >= date_from)
    if date_to:
        query = query.filter(ModelInvoice.invoice_date <= date_to)

    total = query.count()

    skip = (page - 1) * limit
    items = query.options(joinedload(ModelInvoice.user))\
                 .order_by(desc(ModelInvoice.invoice_date))\
                 .offset(skip)\
                 .limit(limit)\
                 .all()

    return items, total

def create_invoice(db: Session, payload: InvoiceCreate) -> ModelInvoice:
    db_obj = ModelInvoice(
        user_id=payload.user_id,
        invoice_date=payload.invoice_date,
        subscription=payload.subscription,
        tips=payload.tips,
        posts=payload.posts,
        messages=payload.messages,
        referrals=payload.referrals,
        streams=payload.streams, # Added Streams
        others=payload.others
    )
    db.add(db_obj)
    db.commit()
    db.refresh(db_obj)
    return db_obj

def get_invoice_by_id(db: Session, invoice_id: int) -> Optional[ModelInvoice]:
    return db.query(ModelInvoice).filter(ModelInvoice.id == invoice_id).first()

def update_invoice(db: Session, invoice_id: int, updates: InvoiceUpdate) -> Optional[ModelInvoice]:
    db_obj = get_invoice_by_id(db, invoice_id)
    if not db_obj:
        return None
    
    data = updates.model_dump(exclude_unset=True)
    for key, value in data.items():
        setattr(db_obj, key, value)

    db.commit()
    db.refresh(db_obj)
    return db_obj

def delete_invoice(db: Session, invoice_id: int) -> bool:
    db_obj = get_invoice_by_id(db, invoice_id)
    if not db_obj:
        return False
    
    db.delete(db_obj)
    db.commit()
    return True

# ... (Keep existing imports and functions)
from sqlalchemy import func

def get_creator_report(
    db: Session,
    user_id: int,
    date_from: date,
    date_to: date
):
    # Base Query
    query = db.query(ModelInvoice).filter(
        ModelInvoice.user_id == user_id,
        ModelInvoice.invoice_date >= date_from,
        ModelInvoice.invoice_date <= date_to
    ).order_by(desc(ModelInvoice.invoice_date))

    records = query.all()

    # Aggregations (Calculated in Python for simplicity/speed on filtered set)
    summary = ReportSummary()
    daily_trend = []

    # Map for graph (ensure sorting)
    # We aggregate dates if multiple entries exist per day (though unlikely)
    date_map = {} 

    for r in records:
        # Sum Totals
        summary.total_subscription += r.subscription
        summary.total_tips += r.tips
        summary.total_messages += r.messages
        summary.total_posts += r.posts
        summary.total_referrals += r.referrals
        summary.total_streams += r.streams
        summary.total_others += r.others
        
        # Row Total
        row_total = r.total_earnings
        summary.total_revenue += row_total

        # Graph Data
        d_str = r.invoice_date
        if d_str not in date_map:
            date_map[d_str] = 0.0
        date_map[d_str] += row_total

    # Format Graph Data (Sorted by Date Ascending)
    sorted_dates = sorted(date_map.keys())
    daily_trend = [DailyStats(date=d, total=date_map[d]) for d in sorted_dates]

    return {
        "summary": summary,
        "daily_trend": daily_trend,
        "records": records
    }