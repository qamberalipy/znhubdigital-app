# app/finance/service.py
import logging
from sqlalchemy.orm import Session, joinedload
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy import desc, func
from fastapi import HTTPException, status
from typing import List, Optional, Tuple
from datetime import date
from decimal import Decimal

from app.finance.models import ExpenseHead, FinancialTransaction, SalaryRecord, TransactionType, SalaryStatus
from app.finance import schema

logger = logging.getLogger(__name__)

# --- EXPENSE HEADS ---
def create_expense_head(db: Session, data: schema.ExpenseHeadCreate) -> ExpenseHead:
    try:
        obj = ExpenseHead(**data.model_dump())
        db.add(obj)
        db.commit()
        db.refresh(obj)
        return obj
    except SQLAlchemyError as e:
        db.rollback()
        logger.error(f"Error creating ExpenseHead: {e}")
        raise HTTPException(status_code=500, detail="Database error occurred.")

def get_expense_heads(db: Session, active_only: bool = False) -> List[ExpenseHead]:
    query = db.query(ExpenseHead)
    if active_only:
        query = query.filter(ExpenseHead.is_active == True)
    return query.order_by(ExpenseHead.name).all()


# --- TRANSACTIONS ---
def create_transaction(db: Session, data: schema.TransactionCreate, user_id: int) -> FinancialTransaction:
    if data.transaction_type == TransactionType.cash_out and not data.expense_head_id:
        raise HTTPException(status_code=400, detail="Cash Out requires an Expense Head ID.")
        
    try:
        obj = FinancialTransaction(**data.model_dump(), created_by=user_id)
        db.add(obj)
        db.commit()
        db.refresh(obj)
        return obj
    except SQLAlchemyError as e:
        db.rollback()
        logger.error(f"Transaction Creation Failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to record transaction.")

def get_paginated_transactions(
    db: Session, page: int, size: int, 
    type_filter: Optional[TransactionType], start_date: date, end_date: date
) -> Tuple[List[FinancialTransaction], int]:
    
    query = db.query(FinancialTransaction).options(joinedload(FinancialTransaction.expense_head))
    query = query.filter(FinancialTransaction.transaction_date >= start_date, FinancialTransaction.transaction_date <= end_date)
    
    if type_filter:
        query = query.filter(FinancialTransaction.transaction_type == type_filter)
        
    total = query.count()
    items = query.order_by(desc(FinancialTransaction.transaction_date))\
                 .offset((page - 1) * size)\
                 .limit(size).all()
                 
    return items, total


# --- SALARIES ---
def create_salary(db: Session, data: schema.SalaryCreate, user_id: int) -> SalaryRecord:
    total = Decimal(str(data.basic_salary)) + Decimal(str(data.allowance))
    normalized_month = data.salary_month.replace(day=1)
    
    try:
        obj = SalaryRecord(
            **data.model_dump(exclude={'salary_month'}),
            salary_month=normalized_month,
            total_amount=total,
            created_by=user_id
        )
        db.add(obj)
        db.commit()
        db.refresh(obj)
        return obj
    except SQLAlchemyError as e:
        db.rollback()
        logger.error(f"Salary Assignment Failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to assign salary.")

def update_salary_status(db: Session, salary_id: int, data: schema.SalaryStatusUpdate, admin_id: int) -> SalaryRecord:
    try:
        # Row-level locking to prevent race conditions during payout
        salary = db.query(SalaryRecord).filter(SalaryRecord.id == salary_id).with_for_update().first()
        
        if not salary:
            raise HTTPException(status_code=404, detail="Salary record not found")
            
        if salary.status == SalaryStatus.paid and data.status == SalaryStatus.unpaid:
            raise HTTPException(status_code=400, detail="Cannot unpay directly. Reverse transaction manually.")

        # Automate Ledger Entry on Payout
        if data.status == SalaryStatus.paid and salary.status != SalaryStatus.paid:
            if not data.payment_method:
                raise HTTPException(status_code=400, detail="Payment method required.")
                
            head = db.query(ExpenseHead).filter(func.lower(ExpenseHead.name) == "salary").first()
            if not head:
                head = ExpenseHead(name="Salary", description="System generated head for staff salaries")
                db.add(head)
                db.flush()
                
            txn = FinancialTransaction(
                transaction_type=TransactionType.cash_out,
                amount=salary.total_amount,
                payment_method=data.payment_method,
                expense_head_id=head.id,
                description=f"Salary payment for user ID {salary.user_id} - Month: {salary.salary_month.strftime('%Y-%m')}",
                transaction_date=date.today(),
                created_by=admin_id
            )
            db.add(txn)
            db.flush()
            
            salary.status = SalaryStatus.paid
            salary.transaction_id = txn.id

        db.commit()
        db.refresh(salary)
        return salary

    except HTTPException:
        db.rollback()
        raise
    except SQLAlchemyError as e:
        db.rollback()
        logger.error(f"Database error during salary payment {salary_id}: {e}")
        raise HTTPException(status_code=500, detail="Critical error processing salary payout.")

def get_salaries(db: Session, user_id: Optional[int] = None) -> List[SalaryRecord]:
    query = db.query(SalaryRecord).options(joinedload(SalaryRecord.user))
    if user_id:
        query = query.filter(SalaryRecord.user_id == user_id)
    return query.order_by(desc(SalaryRecord.salary_month)).all()


# --- REPORTS ---
def get_report(db: Session, start_date: date, end_date: date) -> schema.FinancialSummary:
    cash_in = db.query(func.sum(FinancialTransaction.amount)).filter(
        FinancialTransaction.transaction_type == TransactionType.cash_in,
        FinancialTransaction.transaction_date >= start_date,
        FinancialTransaction.transaction_date <= end_date
    ).scalar() or 0.0

    cash_out = db.query(func.sum(FinancialTransaction.amount)).filter(
        FinancialTransaction.transaction_type == TransactionType.cash_out,
        FinancialTransaction.transaction_date >= start_date,
        FinancialTransaction.transaction_date <= end_date
    ).scalar() or 0.0

    return schema.FinancialSummary(
        total_cash_in=float(cash_in),
        total_cash_out=float(cash_out),
        net_balance=float(cash_in) - float(cash_out),
        start_date=start_date,
        end_date=end_date
    )