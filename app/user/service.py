# app/user/service.py
from typing import Optional, List
from datetime import datetime
from fastapi import HTTPException, status
import sqlalchemy.orm as _orm
from sqlalchemy import or_
from sqlalchemy.exc import IntegrityError, SQLAlchemyError

import app.user.models as _models
import app.user.schema as _schemas
import app.core.db.session as _database

# --- DB Dependency ---
def get_db():
    db = _database.SessionLocal()
    try:
        yield db
    finally:
        db.close()

# --- Helpers ---
def check_email_exists(db: _orm.Session, email: str) -> bool:
    return db.query(_models.User).filter(
        _models.User.email == email, 
        _models.User.is_deleted == False
    ).first() is not None

def check_username_available(db: _orm.Session, username: str) -> bool:
    return db.query(_models.User).filter(
        _models.User.username == username, 
        _models.User.is_deleted == False
    ).first() is None

def get_user_by_id(db: _orm.Session, user_id: int) -> Optional[_models.User]:
    return db.query(_models.User).filter(
        _models.User.id == user_id, 
        _models.User.is_deleted == False
    ).first()

def get_available_users(db: _orm.Session, role: str, manager_id: Optional[int] = None) -> List[_models.User]:
    """
    Returns users of a specific role who are not assigned to anyone yet.
    """
    query = db.query(_models.User).filter(
        _models.User.role == role,
        _models.User.assigned_model_id == None,
        _models.User.is_deleted == False
    )
    
    if manager_id:
        query = query.filter(_models.User.manager_id == manager_id)
        
    return query.all()

# --- CRUD Operations ---

def create_user(db: _orm.Session, user_in: _schemas.UserCreate, creator: _models.User) -> _models.User:
    if check_email_exists(db, user_in.email):
        raise HTTPException(status_code=400, detail="Email already exists")
    
    if not check_username_available(db, user_in.username):
        raise HTTPException(status_code=400, detail="Username already taken")

    try:
        # Exclude rels fields for now
        user_data = user_in.dict(exclude={"password", "manager_id", "assigned_model_id", "assign_model_ids"})
        db_user = _models.User(**user_data, created_at=datetime.utcnow(), is_onboarded=True)
        db_user.set_password(user_in.password)

        # Set Manager ID
        if creator.role == _models.UserRole.manager:
            db_user.manager_id = creator.id
        elif user_in.manager_id:
            db_user.manager_id = user_in.manager_id

        db.add(db_user)
        db.flush() # IMPORTANT: Generate ID before setting relationships

        # 1. Bulk Assignment (Admin assigns Models -> Manager)
        if user_in.assign_model_ids and db_user.role == _models.UserRole.manager:
            if creator.role != _models.UserRole.admin:
                 raise HTTPException(status_code=403, detail="Only Admins can bulk assign models to managers.")
            
            models_to_assign = db.query(_models.User).filter(
                _models.User.id.in_(user_in.assign_model_ids),
                _models.User.role == _models.UserRole.digital_creator,
                _models.User.is_deleted == False
            ).all()

            for model in models_to_assign:
                model.manager_id = db_user.id

        # 2. 1:1 Assignment (Manager assigns Staff -> Model)
        if user_in.assigned_model_id and user_in.role in [_models.UserRole.team_member, _models.UserRole.digital_creator]:
            target = get_user_by_id(db, user_in.assigned_model_id)
            if target:
                if creator.role == _models.UserRole.manager:
                    # Security: Manager must own the target
                    if target.role == _models.UserRole.digital_creator and target.manager_id != creator.id:
                        raise HTTPException(status_code=403, detail="You cannot assign staff to a model you do not manage.")

                if target.assigned_model_id:
                    raise HTTPException(status_code=400, detail="Selected user is already assigned to someone else.")
                
                db_user.assigned_model_id = target.id
                target.assigned_model_id = db_user.id

        db.commit()
        db.refresh(db_user)
        return db_user

    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="User creation failed due to database constraint.")
    except Exception as e:
        db.rollback()
        print(f"Error in create_user: {e}")
        raise HTTPException(status_code=500, detail=f"Internal Server Error: {str(e)}")

def update_user(db: _orm.Session, user_id: int, user_in: _schemas.UserUpdate, current_user: _models.User) -> _models.User:
    user = get_user_by_id(db, user_id)
    if not user: 
        raise HTTPException(status_code=404, detail="User not found")

    try:
        update_data = user_in.dict(exclude_unset=True)

        # HIERARCHY / RELATIONSHIP UPDATES
        if current_user.role in [_models.UserRole.admin, _models.UserRole.manager]:
            
            # Update Manager ID
            if "manager_id" in update_data:
                user.manager_id = update_data.pop("manager_id")
            
            # Bulk Re-Assign Models (For Managers)
            if "assign_model_ids" in update_data:
                model_ids = update_data.pop("assign_model_ids")
                if user.role == _models.UserRole.manager and model_ids is not None:
                    models = db.query(_models.User).filter(_models.User.id.in_(model_ids)).all()
                    for m in models:
                        m.manager_id = user.id

            # 1:1 Relationship (Staff <-> Model)
            if "assigned_model_id" in update_data:
                new_target_id = update_data.pop("assigned_model_id")
                
                # Unlink current partner if exists
                if user.assigned_model_id:
                    old_target = get_user_by_id(db, user.assigned_model_id)
                    if old_target: old_target.assigned_model_id = None
                
                # Link new partner
                if new_target_id:
                    new_target = get_user_by_id(db, new_target_id)
                    if new_target:
                        if current_user.role == _models.UserRole.manager:
                            is_target_model = new_target.role == _models.UserRole.digital_creator
                            if is_target_model and new_target.manager_id != current_user.id:
                                 raise HTTPException(status_code=403, detail="You cannot assign staff to a model you do not manage.")

                        # If new target has a partner, unlink them to avoid conflicts
                        if new_target.assigned_model_id:
                            prev_owner = get_user_by_id(db, new_target.assigned_model_id)
                            if prev_owner: prev_owner.assigned_model_id = None
                        
                        user.assigned_model_id = new_target.id
                        new_target.assigned_model_id = user.id
                    else:
                        user.assigned_model_id = None
                else:
                    user.assigned_model_id = None
        else:
            # Regular users cannot change these fields
            update_data.pop("manager_id", None)
            update_data.pop("assigned_model_id", None)
            update_data.pop("assign_model_ids", None)

        # PROFILE UPDATES
        if "password" in update_data:
            user.set_password(update_data.pop("password"))
        
        # Only Admins can change roles
        if "role" in update_data:
            if current_user.role != _models.UserRole.admin:
                update_data.pop("role", None)
        
        for key, value in update_data.items():
            if hasattr(user, key):
                setattr(user, key, value)

        db.commit()
        db.refresh(user)
        return user

    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Update failed. Username or Email may already exist.")
    except Exception as e:
        db.rollback()
        print(f"Update Error: {e}")
        raise HTTPException(status_code=500, detail="Internal Server Error")

def soft_delete_user(db: _orm.Session, user_id: int) -> bool:
    user = get_user_by_id(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    try:
        timestamp = datetime.utcnow().strftime("%Y%m%d%H%M%S")
        user.email = f"{user.email}_del_{timestamp}"
        if user.username:
            user.username = f"{user.username}_del_{timestamp}"
        
        if user.assigned_model_id:
            partner = get_user_by_id(db, user.assigned_model_id)
            if partner:
                partner.assigned_model_id = None
            user.assigned_model_id = None

        user.is_deleted = True
        user.account_status = _models.AccountStatus.deleted
        
        db.add(user)
        db.commit()
        return True
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to delete user: {str(e)}")

def get_all_users(db: _orm.Session, current_user: _models.User, role=None, search=None, skip=0, limit=100):
    query = db.query(_models.User).filter(_models.User.is_deleted == False)
    
    if current_user.role == _models.UserRole.manager:
        query = query.filter(_models.User.manager_id == current_user.id)
    
    if role: 
        query = query.filter(_models.User.role == role)
    
    if search:
        s = f"%{search}%"
        query = query.filter(or_(_models.User.full_name.ilike(s), _models.User.email.ilike(s)))
    
    result = query.offset(skip).limit(limit).all()
    return result

def change_user_password(db: _orm.Session, user_id: int, password_data: _schemas.ChangePassword):
    user = get_user_by_id(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if not user.verify_password(password_data.old_password):
        raise HTTPException(status_code=400, detail="Incorrect old password")

    try:
        user.set_password(password_data.new_password)
        user.updated_at = datetime.utcnow()
        db.add(user)
        db.commit()
        return {"message": "Password updated successfully"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to update password")