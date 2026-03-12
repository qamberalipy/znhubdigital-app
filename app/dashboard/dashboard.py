# app/dashboard/dashboard.py
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

import app.dashboard.schema as _schemas
import app.dashboard.service as _services
import app.core.db.session as _database
import app.user.models as _models
import app.user.user as _user_auth

router = APIRouter()

def get_db():
    db = _database.SessionLocal()
    try: yield db
    finally: db.close()

@router.get("/stats", response_model=_schemas.DashboardResponse)
async def get_dashboard_stats(
    db: Session = Depends(get_db),
    current_user: _models.User = Depends(_user_auth.get_current_user)
):
    """
    Aggregates stats for the dashboard.
    """
    return _services.get_dashboard_stats(db, current_user)