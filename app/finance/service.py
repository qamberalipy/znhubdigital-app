# app/finance/service.py
import logging
from sqlalchemy.orm import Session, joinedload
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy import desc, func, extract
from fastapi import HTTPException, status
from typing import List, Optional, Tuple
from datetime import date
from decimal import Decimal
from app.user.models import User
import calendar
from app.finance.models import ExpenseHead, FinancialTransaction, SalaryRecord, TransactionType, SalaryStatus
from app.finance import schema

logger = logging.getLogger(__name__)



# Add this below your existing get_report function
def get_monthly_detailed_report(db: Session, target_date: date) -> schema.MonthlyDetailedReport:
    # Calculate boundaries for the selected month
    start_date = target_date.replace(day=1)
    _, last_day = calendar.monthrange(start_date.year, start_date.month)
    end_date = start_date.replace(day=last_day)

    # 1. Inflows by Payment Method
    inflows_q = db.query(
        FinancialTransaction.payment_method,
        func.sum(FinancialTransaction.amount).label("total")
    ).filter(
        FinancialTransaction.transaction_type == TransactionType.cash_in,
        FinancialTransaction.transaction_date >= start_date,
        FinancialTransaction.transaction_date <= end_date
    ).group_by(FinancialTransaction.payment_method).all()
    
    inflows = [
        schema.InflowAggregate(
            payment_method=r.payment_method.value.replace("_", " ").title() if r.payment_method else "Unknown", 
            total_amount=float(r.total or 0)
        ) for r in inflows_q
    ]
    total_income = sum(i.total_amount for i in inflows)

    # 2. Expenses Grouped by Head
    expenses_q = db.query(
        ExpenseHead.name,
        func.sum(FinancialTransaction.amount).label("total")
    ).outerjoin(
        ExpenseHead, FinancialTransaction.expense_head_id == ExpenseHead.id
    ).filter(
        FinancialTransaction.transaction_type == TransactionType.cash_out,
        FinancialTransaction.transaction_date >= start_date,
        FinancialTransaction.transaction_date <= end_date
    ).group_by(ExpenseHead.name).all()
    
    expenses_by_head = [
        schema.ExpenseAggregate(
            head_name=r.name or "Uncategorized Operations", 
            total_amount=float(r.total or 0)
        ) for r in expenses_q
    ]
    
    total_expenses = db.query(func.sum(FinancialTransaction.amount)).filter(
        FinancialTransaction.transaction_type == TransactionType.cash_out,
        FinancialTransaction.transaction_date >= start_date,
        FinancialTransaction.transaction_date <= end_date
    ).scalar() or 0.0
    
    # 3. Staff Salaries (Calculated on a Cash-Basis: When it was actually paid)
    salaries_q = db.query(
        User.full_name,
        SalaryRecord.salary_month,
        func.sum(SalaryRecord.total_amount).label("total")
    ).select_from(SalaryRecord).join(
        User, SalaryRecord.user_id == User.id
    ).join(
        FinancialTransaction, SalaryRecord.transaction_id == FinancialTransaction.id
    ).filter(
        FinancialTransaction.transaction_date >= start_date,
        FinancialTransaction.transaction_date <= end_date,
        SalaryRecord.status == SalaryStatus.paid
    ).group_by(
        User.full_name, 
        SalaryRecord.salary_month
    ).order_by(SalaryRecord.salary_month).all()

    salaries_by_staff = [
        schema.SalaryAggregate(
            # Appends the actual salary month to the name for clear reporting
            staff_name=f"{r.full_name} ({r.salary_month.strftime('%b %Y')})", 
            total_amount=float(r.total or 0)
        ) for r in salaries_q
    ]

    return schema.MonthlyDetailedReport(
        period=start_date.strftime("%B %Y"),
        total_income=float(total_income),
        total_expense=float(total_expenses),
        net_profit=float(total_income) - float(total_expenses),
        expenses_by_head=expenses_by_head,
        salaries_by_staff=salaries_by_staff,
        inflows_by_method=inflows
    )

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
# Add this inside app/finance/service.py under the --- EXPENSE HEADS --- section

def update_expense_head(db: Session, head_id: int, data: schema.ExpenseHeadUpdate) -> ExpenseHead:
    head = db.query(ExpenseHead).filter(ExpenseHead.id == head_id).first()
    if not head:
        raise HTTPException(status_code=404, detail="Expense Category not found.")
    
    try:
        # exclude_unset ensures we only update fields the user actually sent
        update_data = data.model_dump(exclude_unset=True)
        for key, value in update_data.items():
            setattr(head, key, value)
        
        db.commit()
        db.refresh(head)
        return head
    except SQLAlchemyError as e:
        db.rollback()
        logger.error(f"Error updating ExpenseHead {head_id}: {e}")
        raise HTTPException(status_code=500, detail="Database error occurred while updating.")

def delete_expense_head(db: Session, head_id: int):
    head = db.query(ExpenseHead).filter(ExpenseHead.id == head_id).first()
    if not head:
        raise HTTPException(status_code=404, detail="Expense Category not found.")
    
    # Safety Check: Do not allow deletion if transactions are already linked to this head
    if db.query(FinancialTransaction).filter(FinancialTransaction.expense_head_id == head_id).first():
        raise HTTPException(
            status_code=400, 
            detail="Cannot delete this category because it is already used in existing transactions. Consider marking it as inactive instead."
        )
        
    try:
        db.delete(head)
        db.commit()
        return True
    except SQLAlchemyError as e:
        db.rollback()
        logger.error(f"Error deleting ExpenseHead {head_id}: {e}")
        raise HTTPException(status_code=500, detail="Database error occurred while deleting.")

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

# Add this inside app/finance/service.py under the --- TRANSACTIONS --- section

def update_transaction(db: Session, txn_id: int, data: schema.TransactionUpdate) -> FinancialTransaction:
    txn = db.query(FinancialTransaction).filter(FinancialTransaction.id == txn_id).first()
    if not txn:
        raise HTTPException(status_code=404, detail="Transaction not found.")
    
    try:
        update_data = data.model_dump(exclude_unset=True)
        for key, value in update_data.items():
            setattr(txn, key, value)
            
        db.commit()
        db.refresh(txn)
        return txn
    except SQLAlchemyError as e:
        db.rollback()
        logger.error(f"Error updating Transaction {txn_id}: {e}")
        raise HTTPException(status_code=500, detail="Database error occurred while updating.")

def delete_transaction(db: Session, txn_id: int):
    txn = db.query(FinancialTransaction).filter(FinancialTransaction.id == txn_id).first()
    if not txn:
        raise HTTPException(status_code=404, detail="Transaction not found.")
    
    try:
        # Crucial: If we are deleting a ledger payout, delete the connected salary record too to keep it clean.
        if txn.salary_record:
            db.delete(txn.salary_record)
            
        db.delete(txn)
        db.commit()
        return True
    except SQLAlchemyError as e:
        db.rollback()
        logger.error(f"Error deleting Transaction {txn_id}: {e}")
        raise HTTPException(status_code=500, detail="Database error occurred while deleting.")
    
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

def get_paginated_transactions(
    db: Session, page: int, size: int, 
    type_filter: Optional[TransactionType], start_date: date, end_date: date
) -> Tuple[List[FinancialTransaction], int]:
    
    query = db.query(FinancialTransaction).options(
        joinedload(FinancialTransaction.expense_head),
        joinedload(FinancialTransaction.salary_record).joinedload(SalaryRecord.user) # Load staff details
    )
    query = query.filter(FinancialTransaction.transaction_date >= start_date, FinancialTransaction.transaction_date <= end_date)
    
    if type_filter:
        query = query.filter(FinancialTransaction.transaction_type == type_filter)
        
    total = query.count()
    items = query.order_by(desc(FinancialTransaction.transaction_date))\
                 .offset((page - 1) * size)\
                 .limit(size).all()
                 
    return items, total

# --- SALARIES ---
def direct_pay_salary(db: Session, data: schema.SalaryDirectPay, admin_id: int) -> SalaryRecord:
    """Atomic operation: Creates salary and immediately logs it in the ledger."""
    try:
        total = Decimal(str(data.basic_salary)) + Decimal(str(data.allowance))
        normalized_month = data.salary_month.replace(day=1)

        salary = SalaryRecord(
            user_id=data.user_id,
            basic_salary=data.basic_salary,
            allowance=data.allowance,
            total_amount=total,
            note=data.note,
            salary_month=normalized_month,
            status=SalaryStatus.paid,
            created_by=admin_id
        )
        db.add(salary)
        db.flush()

        # Get or create 'Salary' Expense Head
        head = db.query(ExpenseHead).filter(func.lower(ExpenseHead.name) == "salary").first()
        if not head:
            head = ExpenseHead(name="Salary", description="System generated head for staff salaries")
            db.add(head)
            db.flush()

        txn = FinancialTransaction(
            transaction_type=TransactionType.cash_out,
            amount=total,
            payment_method=data.payment_method,
            expense_head_id=head.id,
            description=f"Payroll: {data.salary_month.strftime('%B %Y')}",
            transaction_date=date.today(),
            created_by=admin_id
        )
        db.add(txn)
        db.flush()

        salary.transaction_id = txn.id
        db.commit()
        db.refresh(salary)
        return salary
    except SQLAlchemyError as e:
        db.rollback()
        logger.error(f"Direct Salary Payment Failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to process payroll.")

def update_salary(db: Session, salary_id: int, data: schema.SalaryUpdate) -> SalaryRecord:
    """Updates the salary and automatically syncs the connected ledger transaction."""
    try:
        salary = db.query(SalaryRecord).filter(SalaryRecord.id == salary_id).with_for_update().first()
        if not salary:
            raise HTTPException(status_code=404, detail="Salary record not found")

        update_data = data.model_dump(exclude_unset=True)

        if 'basic_salary' in update_data or 'allowance' in update_data:
            salary.basic_salary = update_data.get('basic_salary', salary.basic_salary)
            salary.allowance = update_data.get('allowance', salary.allowance)
            salary.total_amount = Decimal(str(salary.basic_salary)) + Decimal(str(salary.allowance))

            # Sync ledger amount
            if salary.transaction_id:
                txn = db.query(FinancialTransaction).filter(FinancialTransaction.id == salary.transaction_id).first()
                if txn: txn.amount = salary.total_amount

        if 'note' in update_data: salary.note = update_data['note']
        if 'salary_month' in update_data: salary.salary_month = update_data['salary_month'].replace(day=1)
        if 'payment_method' in update_data and salary.transaction_id:
            txn = db.query(FinancialTransaction).filter(FinancialTransaction.id == salary.transaction_id).first()
            if txn: txn.payment_method = update_data['payment_method']

        db.commit()
        db.refresh(salary)
        return salary
    except SQLAlchemyError as e:
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to update salary.")
    
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