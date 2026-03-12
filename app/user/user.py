# app/user/user.py
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session

import app.user.schema as _schemas
import app.user.service as _services
import app.user.models as _models

router = APIRouter()

# --- Dependency Injection ---
def get_db():
    return _services.get_db()

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

async def get_admin_or_manager(current_user: _models.User = Depends(get_current_user)) -> _models.User:
    if current_user.role not in [_models.UserRole.admin, _models.UserRole.manager]:
        raise HTTPException(status_code=403, detail="Not authorized")
    return current_user

# --- Utility Endpoints ---

@router.get("/available/managers", response_model=List[_schemas.UserInList], tags=["Utility"])
def list_managers(db: Session = Depends(_services.get_db), current_user = Depends(get_admin_or_manager)):
    return db.query(_models.User).filter(_models.User.role == "manager", _models.User.is_deleted == False).all()

@router.get("/available/team-members", response_model=List[_schemas.UserInList], tags=["Utility"])
def list_free_team_members(db: Session = Depends(_services.get_db), current_user: _models.User = Depends(get_admin_or_manager)):
    # If Manager, scope to their ID. If Admin, mgr_id is None (returns all).
    mgr_id = current_user.id if current_user.role == _models.UserRole.manager else None
    return _services.get_available_users(db, role="team_member", manager_id=mgr_id)

@router.get("/available/models", response_model=List[_schemas.UserInList], tags=["Utility"])
def list_free_models(db: Session = Depends(_services.get_db), current_user: _models.User = Depends(get_admin_or_manager)):
    # If Manager, scope to their ID.
    mgr_id = current_user.id if current_user.role == _models.UserRole.manager else None
    return _services.get_available_users(db, role="digital_creator", manager_id=mgr_id)

# --- CRUD Endpoints ---

@router.post("/", response_model=_schemas.UserOut, status_code=status.HTTP_201_CREATED, tags=["User CRUD API"])
async def create_user(
    user_in: _schemas.UserCreate,
    current_user: _models.User = Depends(get_admin_or_manager),
    db: Session = Depends(_services.get_db)
):
    if current_user.role == _models.UserRole.manager and user_in.role == _schemas.UserRoleEnum.admin:
        raise HTTPException(status_code=403, detail="Managers cannot create Admins")
        
    return _services.create_user(db, user_in, creator=current_user)

@router.put("/{user_id}", response_model=_schemas.UserOut, tags=["User CRUD API"])
async def update_user(
    user_id: int,
    user_in: _schemas.UserUpdate,
    current_user: _models.User = Depends(get_current_user),
    db: Session = Depends(_services.get_db)
):
    is_admin_or_manager = current_user.role in [_models.UserRole.admin, _models.UserRole.manager]
    
    if current_user.id != user_id and not is_admin_or_manager:
        raise HTTPException(status_code=403, detail="Cannot update other users")

    # Security: Passed to service layer which handles field filtering (role, assignments)
    return _services.update_user(db, user_id, user_in, current_user)

@router.delete("/{user_id}", tags=["User CRUD API"])
async def delete_user(
    user_id: int,
    current_user: _models.User = Depends(get_admin_or_manager),
    db: Session = Depends(_services.get_db)
):
    if current_user.id == user_id:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")
        
    _services.soft_delete_user(db, user_id)
    return {"message": "User deleted successfully"}

@router.get("/", response_model=List[_schemas.UserOut], tags=["User CRUD API"])
async def get_all_users(
    skip: int = 0,
    limit: int = 100,
    role: Optional[str] = None, 
    search: Optional[str] = None,
    current_user: _models.User = Depends(get_admin_or_manager),
    db: Session = Depends(_services.get_db)
    ):
    try:
        if role:
            role = role.strip("'\" ") 
            if role.lower() == "null" or role == "": role = None

        if search:
            search = search.strip("'\" ")
            if search.lower() == "null" or search == "": search = None
        
        return _services.get_all_users(
            db=db, 
            current_user=current_user,
            skip=skip, 
            limit=limit, 
            role=role, 
            search=search
        )
    except Exception as e:
        print(f"Error processing query params: {e}")
        raise HTTPException(status_code=400, detail="Invalid query parameters")

@router.get("/{user_id}", response_model=_schemas.UserOut, tags=["User CRUD API"])
async def get_user_by_id(
    user_id: int,
    current_user: _models.User = Depends(get_current_user),
    db: Session = Depends(_services.get_db)
):
    user = _services.get_user_by_id(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user

@router.post("/change-password", status_code=status.HTTP_200_OK, tags=["User CRUD API"])
async def change_password(
    password_data: _schemas.ChangePassword,
    current_user: _models.User = Depends(get_current_user),
    db: Session = Depends(_services.get_db)
):
    return _services.change_user_password(db, current_user.id, password_data)