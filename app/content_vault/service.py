from sqlalchemy.orm import Session, joinedload, aliased
from sqlalchemy import func, desc, or_
from fastapi import HTTPException
from typing import List, Optional
from datetime import date

import app.user.models as _user_models
import app.task.models as _task_models # Importing from Task module as requested

# --- Logic: Get "Folders" (Users) ---
def get_vault_folders(db: Session, current_user: _user_models.User):
    """
    Returns a list of users (uploaders) that the current_user is allowed to see.
    These act as the 'root folders' in the drive interface.
    """
    # 1. Base Query: Get Distinct Uploaders from ContentVault
    # We join User to get profile info
    query = db.query(
        _user_models.User,
        func.count(_task_models.ContentVault.id).label('file_count')
    ).join(
        _task_models.ContentVault, 
        _task_models.ContentVault.uploader_id == _user_models.User.id
    )

    # 2. RBAC Filtering
    if current_user.role == _user_models.UserRole.admin:
        # Admin sees everyone who has uploaded something
        pass
    
    elif current_user.role == _user_models.UserRole.manager:
        # Manager sees only their assigned team (Creators & Members)
        query = query.filter(_user_models.User.manager_id == current_user.id)
        
    elif current_user.role == _user_models.UserRole.team_member:
        # Team Member sees only their assigned Digital Creator
        if current_user.assigned_model_id:
            query = query.filter(_user_models.User.id == current_user.assigned_model_id)
        else:
            return [] # No assigned model, no folders
            
    elif current_user.role == _user_models.UserRole.digital_creator:
        # Creator only sees themselves
        query = query.filter(_user_models.User.id == current_user.id)

    # 3. Grouping & Execution
    results = query.group_by(_user_models.User.id).all()
    
    # 4. Format Output
    folders = []
    for user, count in results:
        folder = user
        folder.file_count = count # Attach dynamic count
        folders.append(folder)
        
    return folders

# --- Logic: Get Files in a Folder ---
def get_vault_files(
    db: Session, 
    current_user: _user_models.User,
    target_user_id: int,
    skip: int = 0,
    limit: int = 20,
    media_type: Optional[str] = None, # image, video, document
    date_from: Optional[date] = None,
    date_to: Optional[date] = None
):
    """
    Returns files for a specific user (Folder), with filters.
    Strictly checks if current_user has access to target_user_id.
    """
    
    # 1. Access Check (Manual RBAC verification)
    has_access = False
    if current_user.id == target_user_id:
        has_access = True
    elif current_user.role == _user_models.UserRole.admin:
        has_access = True
    elif current_user.role == _user_models.UserRole.manager:
        target_user = db.query(_user_models.User).get(target_user_id)
        if target_user and target_user.manager_id == current_user.id:
            has_access = True
    elif current_user.role == _user_models.UserRole.team_member:
        if current_user.assigned_model_id == target_user_id:
            has_access = True
            
    if not has_access:
        raise HTTPException(status_code=403, detail="Access to this folder is denied.")

    # 2. Build Query
    query = db.query(_task_models.ContentVault).filter(
        _task_models.ContentVault.uploader_id == target_user_id
    ).options(
        joinedload(_task_models.ContentVault.task) # Load task context
    )

    # 3. Apply Filters
    
    # Filter: Media Type (image, video, document)
    if media_type:
        if media_type == 'image':
            query = query.filter(_task_models.ContentVault.mime_type.ilike('image%'))
        elif media_type == 'video':
            query = query.filter(_task_models.ContentVault.mime_type.ilike('video%'))
        elif media_type == 'document':
            query = query.filter(or_(
                _task_models.ContentVault.mime_type.ilike('application%'),
                _task_models.ContentVault.mime_type.ilike('text%')
            ))

    # Filter: Date Range
    if date_from:
        query = query.filter(_task_models.ContentVault.created_at >= date_from)
    if date_to:
        query = query.filter(_task_models.ContentVault.created_at <= date_to)

    # 4. Pagination
    total = query.count()
    files = query.order_by(desc(_task_models.ContentVault.created_at))\
                 .offset(skip)\
                 .limit(limit)\
                 .all()

    # 5. Enrich Data (Add simple media_type string)
    results = []
    for f in files:
        m_type = "document"
        if f.mime_type:
            if f.mime_type.startswith("image"): m_type = "image"
            elif f.mime_type.startswith("video"): m_type = "video"
        
        # We attach this attribute dynamically so schema can read it
        f.media_type = m_type 
        results.append(f)

    return {
        "total": total,
        "skip": skip,
        "limit": limit,
        "data": results
    }