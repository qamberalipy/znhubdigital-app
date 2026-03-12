# app/task/service.py
import datetime
from sqlalchemy import desc, or_
from sqlalchemy.orm import Session, joinedload, aliased
from sqlalchemy.exc import SQLAlchemyError
from fastapi import HTTPException, status, BackgroundTasks
from typing import List, Optional, Set

import app.task.models as _models
import app.user.models as _user_models
import app.task.schema as _schemas
import app.notification.models as _notif_models 
from app.notification.service import notify_users 

# --- Helpers ---
def get_task_or_404(db: Session, task_id: int):
    task = db.query(_models.Task).options(
        joinedload(_models.Task.assigner),
        joinedload(_models.Task.assignee),
        joinedload(_models.Task.attachments)
    ).filter(_models.Task.id == task_id).first()
    
    if not task:
        raise HTTPException(status_code=404, detail=f"Task {task_id} not found")
    return task

def get_my_assignees(db: Session, current_user: _user_models.User):
    try:
        query = db.query(_user_models.User).filter(
            _user_models.User.role == _user_models.UserRole.digital_creator,
            _user_models.User.is_deleted == False
        )
        if current_user.role == _user_models.UserRole.manager:
            query = query.filter(_user_models.User.manager_id == current_user.id)
        elif current_user.role == _user_models.UserRole.team_member:
            if current_user.assigned_model_id:
                query = query.filter(_user_models.User.id == current_user.assigned_model_id)
            else:
                return []
        return query.all()
    except SQLAlchemyError as e:
        raise HTTPException(status_code=500, detail=f"DB Error: {str(e)}")

def _get_admin_ids(db: Session) -> List[int]:
    """Helper to fetch all Admin IDs for notifications"""
    admins = db.query(_user_models.User.id).filter(
        _user_models.User.role == _user_models.UserRole.admin,
        _user_models.User.is_deleted == False
    ).all()
    return [a.id for a in admins]

# --- 1. Create Task (HIERARCHY FIXED) ---
def create_task(
    db: Session, 
    task_in: _schemas.TaskCreate, 
    current_user: _user_models.User,
    background_tasks: BackgroundTasks 
):
    try:
        # A. Validation
        assignee = db.query(_user_models.User).filter(
            _user_models.User.id == task_in.assignee_id,
            _user_models.User.role == _user_models.UserRole.digital_creator,
            _user_models.User.is_deleted == False
        ).first()
        
        if not assignee:
            raise HTTPException(status_code=400, detail="Invalid or Deleted Assignee.")

        if current_user.role != _user_models.UserRole.admin:
            if current_user.role == _user_models.UserRole.team_member:
                if current_user.assigned_model_id != assignee.id:
                    raise HTTPException(status_code=403, detail="You can only assign tasks to your paired Digital Creator.")
            elif current_user.role == _user_models.UserRole.manager:
                if assignee.manager_id != current_user.id:
                    raise HTTPException(status_code=403, detail="You can only assign tasks to models in your team.")

        # B. Creation
        data = task_in.dict()
        attachments_data = data.pop("attachments", [])
        tags_list = data.pop("req_outfit_tags", [])
        tags_csv = ",".join(tags_list) if tags_list else None

        new_task = _models.Task(
            **data,
            req_outfit_tags=tags_csv,
            assigner_id=current_user.id
        )
        # Ensure Enum Values are stored as strings
        new_task.status = task_in.status.value
        new_task.priority = task_in.priority.value
        new_task.req_content_type = task_in.req_content_type.value

        db.add(new_task)
        db.flush() 

        for file_data in attachments_data:
            vault_item = _models.ContentVault(
                uploader_id=current_user.id,
                task_id=new_task.id,
                file_url=file_data['file_url'],
                thumbnail_url=file_data.get('thumbnail_url'),
                file_size_mb=file_data['file_size_mb'],
                mime_type=file_data['mime_type'],
                duration_seconds=file_data.get('duration_seconds', 0),
                tags=file_data.get('tags', 'Reference'), 
                content_type=new_task.req_content_type,
                status=_models.ContentStatus.approved.value
            )
            db.add(vault_item)

        db.commit()
        db.refresh(new_task)

        # C. [CORRECTED HIERARCHY NOTIFICATION]
        try:
            # 1. Start with the Creator (Assignee)
            recipients: Set[int] = {new_task.assignee_id}
            
            # 2. Fetch Admins
            admin_ids = _get_admin_ids(db)

            # 3. Apply Hierarchy Rules
            if current_user.role == _user_models.UserRole.manager:
                # Rule: "If assigned by Manager -> Manager and Admin"
                recipients.add(current_user.id) # Manager (Self)
                recipients.update(admin_ids)    # Admins

            elif current_user.role == _user_models.UserRole.team_member:
                # Rule: "If assigned by Team Member -> Corresponding Manager and Admin"
                if current_user.manager_id:
                    recipients.add(current_user.manager_id) # Manager
                recipients.update(admin_ids)                # Admins

            elif current_user.role == _user_models.UserRole.admin:
                # Rule: "If assigned by Admin -> Only Admin" (Creators still get it)
                recipients.update(admin_ids)
                # Note: Managers are explicitly EXCLUDED here as per requirement

            # 4. Send Notification
            notify_users(
                background_tasks=background_tasks,
                recipient_ids=list(recipients),
                title="New Task Assigned",
                body=f"{current_user.full_name} assigned: {new_task.title}",
                category=_notif_models.NotificationCategory.TASK,
                severity=_notif_models.NotificationSeverity.NORMAL,
                entity_id=new_task.id,
                click_url=f"/task_assigner",
                actor_id=current_user.id
            )
        except Exception as e:
            print(f"Notification Error: {e}")

        return new_task

    except SQLAlchemyError as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"DB Error: {str(e)}")

# --- 2. Update Task ---
def update_task(
    db: Session, 
    task_id: int, 
    updates: _schemas.TaskUpdate, 
    current_user: _user_models.User,
    background_tasks: BackgroundTasks
):
    task = get_task_or_404(db, task_id)

    if current_user.role == _user_models.UserRole.digital_creator:
        allowed_fields = ['status']
        for field in updates.dict(exclude_unset=True).keys():
            if field not in allowed_fields:
                raise HTTPException(status_code=403, detail="Creators can only update task status.")

    try:
        update_data = updates.dict(exclude_unset=True)
        old_status = task.status
        new_status = None
        
        if 'status' in update_data:
            val = update_data['status']
            new_status = val.value if hasattr(val, 'value') else val

        if 'req_outfit_tags' in update_data:
            tags_list = update_data.pop('req_outfit_tags')
            task.req_outfit_tags = ",".join(tags_list) if tags_list else None

        for key, value in update_data.items():
            if hasattr(value, 'value'):
                value = value.value
            setattr(task, key, value)
            
        db.commit()
        db.refresh(task)

        # [NOTIFICATION: Status Updates]
        if new_status and new_status != old_status:
            try:
                recipients = set()
                
                # If Creator updates -> Notify Assigner + Manager + Admins
                if current_user.id == task.assignee_id:
                    recipients.add(task.assigner_id)
                    # Add Manager if Assigner is Team Member
                    assigner = db.query(_user_models.User).filter(_user_models.User.id == task.assigner_id).first()
                    if assigner and assigner.role == _user_models.UserRole.team_member and assigner.manager_id:
                        recipients.add(assigner.manager_id)
                    # Add Admins
                    recipients.update(_get_admin_ids(db))
                    
                    body_text = f"{current_user.full_name} updated status to {new_status}"
                else:
                    # If Supervisor updates -> Notify Creator
                    recipients.add(task.assignee_id)
                    body_text = f"Status updated to {new_status}"

                if recipients:
                    notify_users(
                        background_tasks=background_tasks,
                        recipient_ids=list(recipients),
                        title="Task Updated",
                        body=body_text,
                        category=_notif_models.NotificationCategory.TASK,
                        severity=_notif_models.NotificationSeverity.NORMAL,
                        entity_id=task.id,
                        click_url=f"/task_assigner",
                        actor_id=current_user.id
                    )
            except Exception as e:
                print(f"Notification Error: {e}")

        return task
    except SQLAlchemyError as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Update failed: {str(e)}")

# --- 3. Delete Task ---
def delete_task(
    db: Session, 
    task_id: int, 
    current_user: _user_models.User,
    background_tasks: BackgroundTasks
):
    task = get_task_or_404(db, task_id)
    
    can_delete = False
    if current_user.role == _user_models.UserRole.admin:
        can_delete = True
    elif task.assigner_id == current_user.id:
        can_delete = True
        
    if not can_delete:
        raise HTTPException(status_code=403, detail="You can only delete tasks you created.")

    assignee_id = task.assignee_id
    task_title = task.title

    try:
        db.delete(task)
        db.commit()

        # Notify Assignee if they didn't delete it
        if assignee_id != current_user.id:
            notify_users(
                background_tasks=background_tasks,
                recipient_ids=[assignee_id],
                title="Task Cancelled",
                body=f"Task '{task_title}' was removed",
                category=_notif_models.NotificationCategory.TASK,
                severity=_notif_models.NotificationSeverity.NORMAL,
                entity_id=0, 
                click_url="/task_assigner",
                actor_id=current_user.id
            )

        return {"message": "Task deleted successfully"}
    except SQLAlchemyError as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Delete failed: {str(e)}")

# --- 4. Submit Task ---
def submit_task_work(
    db: Session, 
    task_id: int, 
    submission: _schemas.TaskSubmission, 
    current_user: _user_models.User,
    background_tasks: BackgroundTasks
):
    task = get_task_or_404(db, task_id)

    if task.assignee_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the assigned creator can submit work.")

    try:
        for file_data in submission.deliverables:
            vault_item = _models.ContentVault(
                uploader_id=current_user.id,
                task_id=task.id,
                file_url=file_data.file_url,
                thumbnail_url=file_data.thumbnail_url,
                file_size_mb=file_data.file_size_mb,
                mime_type=file_data.mime_type,
                duration_seconds=file_data.duration_seconds,
                tags=file_data.tags or "Deliverable",
                content_type=task.req_content_type,
                status=_models.ContentStatus.pending.value
            )
            db.add(vault_item)

        task.status = _models.TaskStatus.completed.value
        task.completed_at = datetime.datetime.now()
        
        sys_msg = _models.TaskChat(
            task_id=task.id,
            user_id=current_user.id,
            message="Work submitted. Task marked as Completed.",
            is_system_log=True
        )
        db.add(sys_msg)
        db.commit()
        db.refresh(task)

        # [NOTIFICATION: Submission]
        # Notify Assigner + Manager + Admins
        recipients = set()
        recipients.add(task.assigner_id)
        
        assigner = db.query(_user_models.User).filter(_user_models.User.id == task.assigner_id).first()
        if assigner and assigner.role == _user_models.UserRole.team_member and assigner.manager_id:
            recipients.add(assigner.manager_id)
            
        recipients.update(_get_admin_ids(db))

        notify_users(
            background_tasks=background_tasks,
            recipient_ids=list(recipients),
            title="Task Submitted",
            body=f"{current_user.full_name} submitted work for '{task.title}'",
            category=_notif_models.NotificationCategory.TASK,
            severity=_notif_models.NotificationSeverity.HIGH,
            entity_id=task.id,
            click_url=f"/task_assigner",
            actor_id=current_user.id
        )

        return task

    except SQLAlchemyError as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Submission failed: {str(e)}")

# --- 5. Get All Tasks (Unchanged) ---
def get_all_tasks(
    db: Session, 
    current_user: _user_models.User, 
    skip: int = 1,
    limit: int = 10,
    search: Optional[str] = None,
    status: Optional[str] = None,
    assignee_id: Optional[int] = None
):
    try:
        query = db.query(_models.Task).options(
            joinedload(_models.Task.assigner),
            joinedload(_models.Task.assignee),
            joinedload(_models.Task.chat_messages),
            joinedload(_models.Task.attachments)
        )

        if current_user.role == _user_models.UserRole.digital_creator:
            query = query.filter(_models.Task.assignee_id == current_user.id)
        elif current_user.role == _user_models.UserRole.manager:
            AssigneeUser = aliased(_user_models.User)
            query = query.join(AssigneeUser, _models.Task.assignee).filter(
                AssigneeUser.manager_id == current_user.id,
                AssigneeUser.is_deleted == False
            )
        elif current_user.role == _user_models.UserRole.team_member:
            if current_user.assigned_model_id:
                query = query.filter(_models.Task.assignee_id == current_user.assigned_model_id)
            else:
                return {"total": 0, "skip": skip, "limit": limit, "tasks": []}

        if status:
            query = query.filter(_models.Task.status == status)

        if assignee_id:
            query = query.filter(_models.Task.assignee_id == assignee_id)

        if search:
            search_term = f"%{search}%"
            query = query.join(_models.Task.assigner).filter(
                or_(
                    _models.Task.title.ilike(search_term),
                    _user_models.User.full_name.ilike(search_term),
                    _user_models.User.username.ilike(search_term)
                )
            )

        total_records = query.count()
        offset = (skip - 1) * limit
        
        tasks = query.order_by(desc(_models.Task.created_at))\
                    .offset(offset)\
                    .limit(limit)\
                    .all()

        for task in tasks:
            task.chat_count = len(task.chat_messages)
            task.attachments_count = len(task.attachments)
            task.is_created_by_me = (task.assigner_id == current_user.id)

        return {
            "total": total_records,
            "skip": skip,
            "limit": limit,
            "tasks": tasks
        }
    except SQLAlchemyError as e:
        raise HTTPException(status_code=500, detail=f"DB Error: {str(e)}")

# --- 6. Chat & Content (Unchanged) ---
def get_chat_history(db: Session, task_id: int, direction: int = 0, last_message_id: int = 0, limit: int = 10):
    query = db.query(_models.TaskChat)\
        .options(joinedload(_models.TaskChat.author))\
        .filter(_models.TaskChat.task_id == task_id)

    if direction == 1 and last_message_id > 0:
        query = query.filter(_models.TaskChat.id < last_message_id)\
                     .order_by(_models.TaskChat.id.desc())
    elif direction == 2 and last_message_id > 0:
        query = query.filter(_models.TaskChat.id > last_message_id)\
                     .order_by(_models.TaskChat.id.asc())
    else:
        query = query.order_by(_models.TaskChat.id.desc())

    messages = query.limit(limit).all()
    if direction != 2:
        messages.reverse()
    return messages

def send_chat_message(db: Session, task_id: int, message: str, current_user: _user_models.User):
    task = get_task_or_404(db, task_id)
    
    can_chat = False
    if current_user.role == _user_models.UserRole.admin:
        can_chat = True
    elif task.assigner_id == current_user.id or task.assignee_id == current_user.id:
        can_chat = True
    elif task.assignee.manager_id == current_user.id:
        can_chat = True
    elif current_user.role == _user_models.UserRole.team_member and task.assignee.id == current_user.assigned_model_id:
        can_chat = True

    if not can_chat:
        raise HTTPException(status_code=403, detail="You do not have permission to chat in this task.")

    try:
        chat_msg = _models.TaskChat(task_id=task_id, user_id=current_user.id, message=message)
        db.add(chat_msg)
        db.commit()
        db.refresh(chat_msg)
        return chat_msg
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to send message.")

def delete_content_item(db: Session, content_id: int, current_user: _user_models.User):
    item = db.query(_models.ContentVault).filter(_models.ContentVault.id == content_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="File not found")
    if item.uploader_id != current_user.id:
        raise HTTPException(status_code=403, detail="You can only remove files you uploaded.")
    if item.task and item.task.status == _models.TaskStatus.completed.value:
         raise HTTPException(status_code=400, detail="Cannot edit submission for a completed task.")
    try:
        db.delete(item)
        db.commit()
        return {"message": "File removed"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Delete failed: {str(e)}")