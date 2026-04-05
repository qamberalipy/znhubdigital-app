# app/finance/schema.py
from pydantic import BaseModel, ConfigDict, Field
from typing import Optional, List, TypeVar, Generic
from datetime import date, datetime

from app.finance.models import TransactionType, PaymentMethod, SalaryStatus
from app.user.schema import UserOut 

T = TypeVar('T')

class PaginatedResponse(BaseModel, Generic[T]):
    items: List[T]
    total: int
    page: int
    size: int

# --- Expense Head ---
class ExpenseHeadBase(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    description: Optional[str] = None
    is_active: bool = True

class ExpenseHeadCreate(ExpenseHeadBase): pass

class ExpenseHeadUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None

class ExpenseHeadOut(ExpenseHeadBase):
    id: int
    model_config = ConfigDict(from_attributes=True)

# --- Transactions ---
class TransactionBase(BaseModel):
    transaction_type: TransactionType
    amount: float = Field(..., gt=0)
    payment_method: PaymentMethod
    expense_head_id: Optional[int] = None
    description: Optional[str] = None
    transaction_date: date

class TransactionCreate(TransactionBase): pass

class TransactionUpdate(BaseModel):
    amount: Optional[float] = Field(None, gt=0)
    payment_method: Optional[PaymentMethod] = None
    expense_head_id: Optional[int] = None
    description: Optional[str] = None
    transaction_date: Optional[date] = None
    
class TransactionOut(TransactionBase):
    id: int
    created_by: Optional[int] = None
    created_at: datetime
    expense_head: Optional[ExpenseHeadOut] = None
    model_config = ConfigDict(from_attributes=True)

# --- Salaries ---
class SalaryBase(BaseModel):
    user_id: int
    basic_salary: float = Field(..., ge=0)
    allowance: float = Field(0.0, ge=0)
    note: Optional[str] = None
    salary_month: date

class SalaryCreate(SalaryBase): pass

class SalaryStatusUpdate(BaseModel):
    status: SalaryStatus
    payment_method: Optional[PaymentMethod] = None # Required if paying

class SalaryOut(SalaryBase):
    id: int
    total_amount: float
    status: SalaryStatus
    transaction_id: Optional[int] = None
    created_at: datetime
    user: Optional[UserOut] = None
    model_config = ConfigDict(from_attributes=True)

# --- Reports ---
class FinancialSummary(BaseModel):
    total_cash_in: float
    total_cash_out: float
    net_balance: float
    start_date: date
    end_date: date