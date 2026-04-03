# app/finance/models.py
import datetime as _dt
from enum import Enum as _PyEnum
import sqlalchemy as _sql
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

import app.core.db.session as _database

# --- ENUMS ---
class TransactionType(str, _PyEnum):
    cash_in = "cash_in"
    cash_out = "cash_out"

class PaymentMethod(str, _PyEnum):
    cash = "cash"
    bank_transfer = "bank_transfer"
    cheque = "cheque"
    mobile_wallet = "mobile_wallet"
    other = "other"

class SalaryStatus(str, _PyEnum):
    unpaid = "unpaid"
    paid = "paid"


# --- MODELS ---
class ExpenseHead(_database.Base):
    __tablename__ = "expense_head"
    
    id = _sql.Column(_sql.Integer, primary_key=True, index=True, autoincrement=True)
    name = _sql.Column(_sql.String(100), unique=True, nullable=False, index=True) 
    description = _sql.Column(_sql.String(255), nullable=True)
    is_active = _sql.Column(_sql.Boolean, default=True, nullable=False)
    
    transactions = relationship("FinancialTransaction", back_populates="expense_head")


class FinancialTransaction(_database.Base):
    __tablename__ = "financial_transaction"
    
    id = _sql.Column(_sql.Integer, primary_key=True, index=True, autoincrement=True)
    transaction_type = _sql.Column(_sql.Enum(TransactionType, name="transaction_type_enum"), nullable=False, index=True)
    amount = _sql.Column(_sql.Numeric(12, 2), nullable=False) # Handles up to 9,999,999,999.99
    payment_method = _sql.Column(_sql.Enum(PaymentMethod, name="payment_method_enum"), nullable=False)
    
    expense_head_id = _sql.Column(_sql.Integer, _sql.ForeignKey("expense_head.id"), nullable=True)
    description = _sql.Column(_sql.Text, nullable=True)
    transaction_date = _sql.Column(_sql.Date, default=_dt.date.today, nullable=False, index=True)
    
    # Audit trail
    created_by = _sql.Column(_sql.Integer, _sql.ForeignKey("user.id"), nullable=True)
    created_at = _sql.Column(_sql.DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = _sql.Column(_sql.DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    
    # Relationships
    expense_head = relationship("ExpenseHead", back_populates="transactions")
    creator = relationship("User", foreign_keys=[created_by])
    salary_record = relationship("SalaryRecord", back_populates="transaction", uselist=False)


class SalaryRecord(_database.Base):
    __tablename__ = "salary_record"
    
    id = _sql.Column(_sql.Integer, primary_key=True, index=True, autoincrement=True)
    user_id = _sql.Column(_sql.Integer, _sql.ForeignKey("user.id"), nullable=False, index=True)
    
    basic_salary = _sql.Column(_sql.Numeric(10, 2), nullable=False)
    allowance = _sql.Column(_sql.Numeric(10, 2), default=0.00, nullable=False)
    total_amount = _sql.Column(_sql.Numeric(10, 2), nullable=False)
    note = _sql.Column(_sql.Text, nullable=True)
    
    salary_month = _sql.Column(_sql.Date, nullable=False, index=True) 
    status = _sql.Column(_sql.Enum(SalaryStatus, name="salary_status_enum"), default=SalaryStatus.unpaid, nullable=False)
    transaction_id = _sql.Column(_sql.Integer, _sql.ForeignKey("financial_transaction.id"), nullable=True)
    
    # Audit trail
    created_by = _sql.Column(_sql.Integer, _sql.ForeignKey("user.id"), nullable=True)
    created_at = _sql.Column(_sql.DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = _sql.Column(_sql.DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    
    # Relationships
    user = relationship("User", foreign_keys=[user_id])
    creator = relationship("User", foreign_keys=[created_by])
    transaction = relationship("FinancialTransaction", back_populates="salary_record")