# app/finance/finance.py
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import date
import datetime as _dt

from app.core.db.session import SessionLocal
import app.user.user as _user_auth
from app.user.models import User, UserRole
from app.finance import schema, service, models

router = APIRouter()

def get_db():
    db = SessionLocal()
    try: yield db
    finally: db.close()

def require_admin(current_user: User = Depends(_user_auth.get_current_user)):
    if current_user.role != UserRole.admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, 
            detail="Restricted to Administrators only."
        )
    return current_user

# --- Expenses Setup ---
@router.post("/expense-heads", response_model=schema.ExpenseHeadOut, tags=["Finance Setup"])
def create_expense_head(payload: schema.ExpenseHeadCreate, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    return service.create_expense_head(db, payload)

@router.get("/expense-heads", response_model=List[schema.ExpenseHeadOut], tags=["Finance Setup"])
def list_expense_heads(active_only: bool = False, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    return service.get_expense_heads(db, active_only)

# --- Transactions Ledger ---
@router.post("/transactions", response_model=schema.TransactionOut, tags=["Finance Ledger"])
def create_transaction(payload: schema.TransactionCreate, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    return service.create_transaction(db, payload, admin.id)

@router.get("/transactions", response_model=schema.PaginatedResponse[schema.TransactionOut], tags=["Finance Ledger"])
def list_transactions(
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=100),
    type_filter: Optional[models.TransactionType] = None,
    start_date: date = Query(default_factory=lambda: _dt.date.today().replace(day=1)),
    end_date: date = Query(default_factory=_dt.date.today),
    db: Session = Depends(get_db), 
    admin: User = Depends(require_admin)
):
    items, total = service.get_paginated_transactions(db, page, size, type_filter, start_date, end_date)
    return {"items": items, "total": total, "page": page, "size": size}

# --- Salaries (Admin) ---
@router.post("/salaries", response_model=schema.SalaryOut, tags=["Finance Salary"])
def assign_salary(payload: schema.SalaryCreate, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    return service.create_salary(db, payload, admin.id)

@router.get("/salaries", response_model=List[schema.SalaryOut], tags=["Finance Salary"])
def list_all_salaries(db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    return service.get_salaries(db)

@router.patch("/salaries/{salary_id}/status", response_model=schema.SalaryOut, tags=["Finance Salary"])
def update_salary_payment(salary_id: int, payload: schema.SalaryStatusUpdate, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    return service.update_salary_status(db, salary_id, payload, admin.id)

# --- Salaries (Staff Self-Service) ---
@router.get("/my-salary", response_model=List[schema.SalaryOut], tags=["Finance Staff"])
def get_my_salaries(db: Session = Depends(get_db), current_user: User = Depends(_user_auth.get_current_user)):
    return service.get_salaries(db, user_id=current_user.id)

# --- Reports ---
@router.get("/reports/summary", response_model=schema.FinancialSummary, tags=["Finance Reports"])
def get_financial_summary(
    start_date: date = Query(default_factory=lambda: _dt.date.today().replace(day=1)),
    end_date: date = Query(default_factory=_dt.date.today),
    db: Session = Depends(get_db), 
    admin: User = Depends(require_admin)
):
    return service.get_report(db, start_date, end_date)