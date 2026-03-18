# app/user/user.py
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session
import datetime as _dt
import app.user.schema as _schemas
import app.user.service as _services
import app.user.models as _models

router = APIRouter()

def get_db():
    yield from _services.get_db()

async def get_current_user(request: Request, db: Session = Depends(_services.get_db)) -> _models.User:
    if not hasattr(request.state, "user") or not request.state.user:
        raise HTTPException(status_code=401, detail="Authentication credentials missing")
    
    payload = request.state.user
    sub = payload.get("sub")
    
    user_id = None
    if isinstance(sub, dict):
        user_id = sub.get("user_id")
    elif isinstance(sub, (str, int)):
        user_id = sub
        
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token payload")

    user = _services.get_user_by_id(db, user_id=int(user_id))
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user

async def get_admin_user(current_user: _models.User = Depends(get_current_user)) -> _models.User:
    if current_user.role != _models.UserRole.admin:
        raise HTTPException(status_code=403, detail="Only Admins can perform this action")
    return current_user


# --- SHIFT ENDPOINTS ---
@router.get("/shift/status", response_model=_schemas.ShiftStatusOut, tags=["Shift API"])
async def api_shift_status(current_user: _models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    active_shift = _services.get_active_shift(db, current_user.id)
    if active_shift:
        return {"is_active": True, "shift_id": active_shift.id, "start_time": active_shift.start_time}
    return {"is_active": False}

@router.post("/shift/start", response_model=_schemas.ShiftActionOut, tags=["Shift API"])
async def api_start_shift(current_user: _models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    # Optional: Block admins/clients from starting shifts if needed
    if current_user.role not in [_models.UserRole.sale, _models.UserRole.lead_generator, _models.UserRole.developer]:
        raise HTTPException(status_code=403, detail="This role does not require shift tracking.")
        
    shift = _services.start_user_shift(db, current_user)
    return {"message": "Shift started successfully", "shift_id": shift.id, "start_time": shift.start_time}

@router.post("/shift/end", response_model=_schemas.ShiftActionOut, tags=["Shift API"])
async def api_end_shift(current_user: _models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    shift = _services.end_user_shift(db, current_user.id)
    return {
        "message": "Shift ended successfully", 
        "shift_id": shift.id, 
        "start_time": shift.start_time,
        "end_time": shift.end_time,
        "total_hours": shift.total_hours
    }


# --- USER CRUD API ---
@router.post("/", response_model=_schemas.UserOut, status_code=status.HTTP_201_CREATED, tags=["User CRUD API"])
async def create_user(
    user_in: _schemas.UserCreate,
    admin_user: _models.User = Depends(get_admin_user),
    db: Session = Depends(get_db)
):
    return _services.create_user(db, user_in)

@router.put("/{user_id}", response_model=_schemas.UserOut, tags=["User CRUD API"])
async def update_user(
    user_id: int,
    user_in: _schemas.UserUpdate,
    current_user: _models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Allow if the user is an Admin, OR if the user is updating their own profile
    if current_user.id != user_id and current_user.role != _models.UserRole.admin:
        raise HTTPException(status_code=403, detail="You can only update your own profile")

    # Pass current_user to the service so it strips restricted fields (like role) for non-admins
    return _services.update_user(db, user_id, user_in, current_user)

@router.delete("/{user_id}", tags=["User CRUD API"])
async def delete_user(
    user_id: int,
    admin_user: _models.User = Depends(get_admin_user),
    db: Session = Depends(get_db)
):
    if admin_user.id == user_id:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")
    _services.soft_delete_user(db, user_id)
    return {"message": "User deleted successfully"}

@router.get("/", response_model=List[_schemas.UserOut], tags=["User CRUD API"])
async def get_all_users(
    skip: int = 0, limit: int = 100, role: Optional[str] = None, search: Optional[str] = None,
    admin_user: _models.User = Depends(get_admin_user), db: Session = Depends(get_db)
):
    # Pass 'exclude_user_id=admin_user.id' to the service layer
    return _services.get_all_users(
        db=db, 
        skip=skip, 
        limit=limit, 
        role=role, 
        search=search, 
        exclude_user_id=admin_user.id  
    )

@router.get("/{user_id}", response_model=_schemas.UserOut, tags=["User CRUD API"])
async def get_user_by_id(
    user_id: int,
    current_user: _models.User = Depends(get_current_user), 
    db: Session = Depends(get_db)
):
    # Users can view their own profile, Admins can view anyone
    if current_user.id != user_id and current_user.role != _models.UserRole.admin:
        raise HTTPException(status_code=403, detail="Not authorized to view this profile")
        
    user = _services.get_user_by_id(db, user_id)
    if not user: raise HTTPException(status_code=404, detail="User not found")
    return user

@router.post("/change-password", status_code=status.HTTP_200_OK, tags=["User CRUD API"])
async def change_password(
    password_data: _schemas.ChangePassword,
    current_user: _models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Relies securely on the current_user's token ID
    return _services.change_user_password(db, current_user.id, password_data)

# NEW CODE (Fixes 403 Forbidden)
@router.get("/{user_id}/attendance", response_model=_schemas.AttendanceReportOut, tags=["User CRUD API"])
async def get_user_attendance(
    user_id: int,
    start_date: Optional[_dt.date] = None,
    end_date: Optional[_dt.date] = None,
    current_user: _models.User = Depends(get_current_user), 
    db: Session = Depends(get_db)
):
    # Allow if the user is an Admin, OR if the user is viewing their own attendance
    if current_user.id != user_id and current_user.role != _models.UserRole.admin:
        raise HTTPException(status_code=403, detail="Not authorized to view this attendance record")
        
    return _services.get_user_attendance(db, user_id, start_date, end_date)