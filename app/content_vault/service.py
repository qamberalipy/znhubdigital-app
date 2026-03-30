from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, desc, or_
from fastapi import HTTPException
from typing import List, Optional
from datetime import date

import app.user.models as _user_models
import app.task.models as _task_models

# --- Logic: Get "Folders" (Users) ---
def get_vault_folders(db: Session, current_user: _user_models.User):
    """
    Returns a list of users (uploaders) that the current_user is allowed to see.
    These act as the 'root folders' in the drive interface.
    """
    # 1. Base Query: Get Distinct Uploaders from TaskAttachment (formerly ContentVault)
    query = db.query(
        _user_models.User,
        func.count(_task_models.TaskAttachment.id).label('file_count')
    ).join(
        _task_models.TaskAttachment, 
        _task_models.TaskAttachment.uploader_id == _user_models.User.id
    )

    # 2. RBAC Filtering
    if current_user.role == _user_models.UserRole.admin:
        pass
    elif current_user.role == _user_models.UserRole.manager:
        query = query.filter(_user_models.User.manager_id == current_user.id)
    elif current_user.role == _user_models.UserRole.team_member:
        if current_user.assigned_model_id:
            query = query.filter(_user_models.User.id == current_user.assigned_model_id)
        else:
            return [] 
    elif current_user.role == _user_models.UserRole.digital_creator:
        query = query.filter(_user_models.User.id == current_user.id)

    # 3. Grouping & Execution
    results = query.group_by(_user_models.User.id).all()
    
    # 4. Format Output
    folders = []
    for user, count in results:
        folder = user
        folder.file_count = count
        folders.append(folder)
        
    return folders


# --- Logic: Get Files in a Folder ---
def get_vault_files(
    db: Session, 
    current_user: _user_models.User,
    target_user_id: int,
    skip: int = 0,
    limit: int = 20,
    media_type: Optional[str] = None, 
    date_from: Optional[date] = None,
    date_to: Optional[date] = None
):
    """
    Returns files for a specific user (Folder), with filters.
    """
    # 1. Access Check 
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

    # 2. Build Query using TaskAttachment
    query = db.query(_task_models.TaskAttachment).filter(
        _task_models.TaskAttachment.uploader_id == target_user_id
    ).options(
        joinedload(_task_models.TaskAttachment.task)
    )

    # 3. Apply Filters
    if media_type:
        if media_type == 'image':
            query = query.filter(_task_models.TaskAttachment.mime_type.ilike('image%'))
        elif media_type == 'video':
            query = query.filter(_task_models.TaskAttachment.mime_type.ilike('video%'))
        elif media_type == 'document':
            query = query.filter(or_(
                _task_models.TaskAttachment.mime_type.ilike('application%'),
                _task_models.TaskAttachment.mime_type.ilike('text%')
            ))

    if date_from:
        query = query.filter(_task_models.TaskAttachment.created_at >= date_from)
    if date_to:
        query = query.filter(_task_models.TaskAttachment.created_at <= date_to)

    # 4. Pagination
    total = query.count()
    files = query.order_by(desc(_task_models.TaskAttachment.created_at))\
                 .offset(skip)\
                 .limit(limit)\
                 .all()

    # 5. Enrich Data for Pydantic Schema compatibility
    results = []
    for f in files:
        m_type = "document"
        if f.mime_type:
            if f.mime_type.startswith("image"): m_type = "image"
            elif f.mime_type.startswith("video"): m_type = "video"
        
        f.media_type = m_type 
        # Map new fields to old schema names so frontend doesn't break
        f.tags = f.file_name 
        f.content_type = "Attachment" 
        results.append(f)

    return {
        "total": total,
        "skip": skip,
        "limit": limit,
        "data": results
    }