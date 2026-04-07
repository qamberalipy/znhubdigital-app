# app/finance/schema.py
from pydantic import BaseModel, ConfigDict, Field
from typing import Optional, List, TypeVar, Generic
from datetime import date, datetime

from app.finance.models import TransactionType, PaymentMethod, SalaryStatus

T = TypeVar('T')

class PaginatedResponse(BaseModel, Generic[T]):
    items: List[T]
    total: int
    page: int
    size: int

# --- Minimal User (To avoid circular imports) ---
class UserMinimalFinance(BaseModel):
    id: int
    full_name: Optional[str] = None
    email: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)

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

# --- Salaries ---
class SalaryBase(BaseModel):
    user_id: int
    basic_salary: float = Field(..., ge=0)
    allowance: float = Field(0.0, ge=0)
    note: Optional[str] = None
    salary_month: date

class SalaryCreate(SalaryBase): pass

class SalaryDirectPay(SalaryBase):
    payment_method: PaymentMethod

class SalaryUpdate(BaseModel):
    basic_salary: Optional[float] = Field(None, ge=0)
    allowance: Optional[float] = Field(None, ge=0)
    note: Optional[str] = None
    salary_month: Optional[date] = None
    payment_method: Optional[PaymentMethod] = None

class SalaryStatusUpdate(BaseModel):
    status: SalaryStatus
    payment_method: Optional[PaymentMethod] = None

class SalaryOut(SalaryBase):
    id: int
    total_amount: float
    status: SalaryStatus
    transaction_id: Optional[int] = None
    created_at: datetime
    user: Optional[UserMinimalFinance] = None
    model_config = ConfigDict(from_attributes=True)

class SalaryMinimal(BaseModel):
    id: int
    user_id: int
    basic_salary: float
    allowance: float
    note: Optional[str] = None
    salary_month: date
    user: Optional[UserMinimalFinance] = None
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
    salary_record: Optional[SalaryMinimal] = None # Attached so Vue can edit salaries!
    model_config = ConfigDict(from_attributes=True)

# --- Reports ---
class FinancialSummary(BaseModel):
    total_cash_in: float
    total_cash_out: float
    net_balance: float
    start_date: date
    end_date: date

# --- Monthly Detailed Report Schemas ---
class ExpenseAggregate(BaseModel):
    head_name: str
    total_amount: float

class SalaryAggregate(BaseModel):
    staff_name: str
    total_amount: float

class InflowAggregate(BaseModel):
    payment_method: str
    total_amount: float

class MonthlyDetailedReport(BaseModel):
    period: str
    total_income: float
    total_expense: float
    net_profit: float
    expenses_by_head: List[ExpenseAggregate]
    salaries_by_staff: List[SalaryAggregate]
    inflows_by_method: List[InflowAggregate]