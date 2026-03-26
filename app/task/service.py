from sqlalchemy.orm import Session, joinedload
from sqlalchemy import desc
from fastapi import HTTPException, BackgroundTasks
from typing import Optional

import app.task.models as _models
import app.task.schema as _schemas
import app.user.models as _user_models
from app.notification.service import notify_users

def get_task_or_404(db: Session, task_id: int):
    task = db.query(_models.Task).options(
        joinedload(_models.Task.assigner),
        joinedload(_models.Task.assignee)
    ).filter(_models.Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task

def create_task(db: Session, task_in: _schemas.TaskCreate, current_user: _user_models.User, bg_tasks: BackgroundTasks):
    # 1. Admin Authorization
    if current_user.role != _user_models.UserRole.admin:
        raise HTTPException(status_code=403, detail="Only Admins can create tasks in this workflow.")
        
    new_task = _models.Task(
        title=task_in.title,
        description=task_in.description,
        assigner_id=current_user.id,
        assignee_id=task_in.assignee_id,
        lead_id=task_in.lead_id,
        priority=task_in.priority.value,
        due_date=task_in.due_date,
        status=_models.TaskStatus.todo.value
    )
    db.add(new_task)
    db.flush() # Get Task ID
    
    # Add attachments if any uploaded during creation
    if task_in.attachments:
        for att in task_in.attachments:
            new_att = _models.TaskAttachment(
                task_id=new_task.id, uploader_id=current_user.id,
                file_url=att.file_url, file_name=att.file_name
            )
            db.add(new_att)
            
    db.commit()
    db.refresh(new_task)
    
    # Notify Assignee
    notify_users(
        db=db, bg_tasks=bg_tasks, actor_id=current_user.id,
        recipient_ids=[task_in.assignee_id],
        title="New Task Assigned 📌",
        body=f"You have been assigned: {new_task.title}",
        category="task", entity_type="task", entity_id=new_task.id
    )
    return new_task

def get_tasks(
    db: Session, current_user: _user_models.User,
    skip: int = 1, limit: int = 50,
    status: Optional[str] = None, priority: Optional[str] = None,
    assignee_id: Optional[int] = None, lead_id: Optional[int] = None
):
    query = db.query(_models.Task).options(
        joinedload(_models.Task.assigner), joinedload(_models.Task.assignee)
    )
    
    # 10. Daily Workflow Check: Employees only see their own tasks
    if current_user.role != _user_models.UserRole.admin:
        query = query.filter(_models.Task.assignee_id == current_user.id)
    elif assignee_id:
        query = query.filter(_models.Task.assignee_id == assignee_id)
        
    # Filters
    if status: query = query.filter(_models.Task.status == status)
    if priority: query = query.filter(_models.Task.priority == priority)
    if lead_id: query = query.filter(_models.Task.lead_id == lead_id)
        
    total = query.count()
    offset = (skip - 1) * limit
    tasks = query.order_by(desc(_models.Task.created_at)).offset(offset).limit(limit).all()
    
    return {"total": total, "skip": skip, "limit": limit, "tasks": tasks}

def get_task_detail(db: Session, task_id: int, current_user: _user_models.User):
    task = db.query(_models.Task).options(
        joinedload(_models.Task.assigner),
        joinedload(_models.Task.assignee),
        joinedload(_models.Task.comments).joinedload(_models.TaskComment.author),
        joinedload(_models.Task.attachments).joinedload(_models.TaskAttachment.uploader)
    ).filter(_models.Task.id == task_id).first()
    
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
        
    if current_user.role != _user_models.UserRole.admin and current_user.id != task.assignee_id:
        raise HTTPException(status_code=403, detail="Not authorized to view this task")
        
    # Sort comments oldest to newest
    task.comments.sort(key=lambda x: x.created_at)
    return task

def update_task_status(db: Session, task_id: int, status_in: _schemas.TaskStatusUpdate, current_user: _user_models.User, bg_tasks: BackgroundTasks):
    task = get_task_or_404(db, task_id)
    
    is_admin = current_user.role == _user_models.UserRole.admin
    if not is_admin and current_user.id != task.assignee_id:
        raise HTTPException(status_code=403, detail="Not authorized")
        
    new_status = status_in.status.value
    old_status = task.status
    
    if new_status == old_status:
        return task

    # 7. Completion Rule: Only Admin can move to Completed
    if new_status == _models.TaskStatus.completed.value and not is_admin:
        raise HTTPException(status_code=403, detail="Only Admins can approve and move a task to Completed.")
        
    task.status = new_status
    
    # 5. System Communication Log
    sys_log = _models.TaskComment(
        task_id=task.id, user_id=current_user.id,
        comment=f"Moved task from '{old_status}' to '{new_status}' 🚀",
        is_system_log=True
    )
    db.add(sys_log)
    db.commit()
    db.refresh(task)
    
    # Notify appropriate party
    recipient_id = task.assigner_id if current_user.id == task.assignee_id else task.assignee_id
    notify_users(
        db=db, bg_tasks=bg_tasks, actor_id=current_user.id, recipient_ids=[recipient_id],
        title="Task Board Update", body=f"Task '{task.title}' moved to {new_status}.",
        category="task", entity_type="task", entity_id=task.id
    )
    return task

def add_comment(db: Session, task_id: int, comment_in: _schemas.TaskCommentCreate, current_user: _user_models.User, bg_tasks: BackgroundTasks):
    task = get_task_or_404(db, task_id)
    
    if current_user.role != _user_models.UserRole.admin and current_user.id != task.assignee_id:
         raise HTTPException(status_code=403, detail="Not authorized")
         
    new_comment = _models.TaskComment(
        task_id=task.id, user_id=current_user.id,
        comment=comment_in.comment, is_system_log=False
    )
    db.add(new_comment)
    db.commit()
    db.refresh(new_comment)
    
    recipient_id = task.assigner_id if current_user.id == task.assignee_id else task.assignee_id
    notify_users(
        db=db, bg_tasks=bg_tasks, actor_id=current_user.id, recipient_ids=[recipient_id],
        title="New Task Update 💬", body=f"{current_user.full_name} left an update: {comment_in.comment[:40]}...",
        category="task", entity_type="task", entity_id=task.id
    )
    return new_comment
    
def add_attachment(db: Session, task_id: int, attachment_in: _schemas.TaskAttachmentCreate, current_user: _user_models.User):
    task = get_task_or_404(db, task_id)
    
    # Allows Admin OR the specific Task Assignee to upload files!
    if current_user.role != _user_models.UserRole.admin and current_user.id != task.assignee_id:
         raise HTTPException(status_code=403, detail="Not authorized to attach files to this task.")
         
    new_att = _models.TaskAttachment(
        task_id=task.id, 
        uploader_id=current_user.id,
        file_url=attachment_in.file_url, 
        file_name=attachment_in.file_name,
        thumbnail_url=attachment_in.thumbnail_url,
        file_size_mb=attachment_in.file_size_mb,
        mime_type=attachment_in.mime_type,
        duration_seconds=attachment_in.duration_seconds
    )
    db.add(new_att)
    
    # Add System Log for transparency
    sys_log = _models.TaskComment(
        task_id=task.id, user_id=current_user.id,
        comment=f"Attached a new file: {attachment_in.file_name or 'Media File'}",
        is_system_log=True
    )
    db.add(sys_log)
    db.commit()
    db.refresh(new_att)
    return new_att