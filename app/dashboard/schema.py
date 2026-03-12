# app/dashboard/schema.py
from pydantic import BaseModel
from typing import List, Optional

class MetricStats(BaseModel):
    overdue: int
    missing: int
    unsigned: int
    blocked: int

class CompletionStats(BaseModel):
    overall_rate: int

class MissingContentItem(BaseModel):
    name: str
    count: int

class DocumentItem(BaseModel):
    user_name: str
    doc_name: str
    status: str
    badge_class: str

class TimeStats(BaseModel):
    avg_days: float

class DashboardResponse(BaseModel):
    metrics: MetricStats
    completion: CompletionStats
    lists: dict  # Contains "missing_content" and "documents" lists
    time: TimeStats