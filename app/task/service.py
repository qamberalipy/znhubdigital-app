from sqlalchemy.orm import Session, joinedload
from sqlalchemy import desc, or_
from fastapi import HTTPException, BackgroundTasks
from typing import Optional, List

import app.task.models as _models
import app.task.schema as _schemas
import app.user.models as _user_models
from app.notification.service import notify_users

# ==========================================
# PROJECT SERVICES
# ==========================================

def get_project_or_404(db: Session, project_id: int, current_user: _user_models.User) -> _models.Project:
    """Fetches project and enforces Project-Based Access Control (PBAC)."""
    project = db.query(_models.Project).options(joinedload(_models.Project.members)).filter(_models.Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
        
    # Security Check: Is the user an Admin or a member of the project?
    if current_user.role != _user_models.UserRole.admin:
        is_member = any(member.id == current_user.id for member in project.members)
        if not is_member:
            raise HTTPException(status_code=403, detail="You do not have access to this Project.")
            
    return project

def create_project(db: Session, project_in: _schemas.ProjectCreate, current_user: _user_models.User) -> _models.Project:
    if current_user.role != _user_models.UserRole.admin:
        raise HTTPException(status_code=403, detail="Only Admins can create Projects.")
        
    new_project = _models.Project(
        name=project_in.name,
        description=project_in.description,
        created_by_id=current_user.id
    )
    
    # Assign passed members
    users_to_add = db.query(_user_models.User).filter(_user_models.User.id.in_(project_in.member_ids)).all()
    new_project.members.extend(users_to_add)
    
    # FIX: Fetch the current user in the CURRENT database session to avoid DetachedInstance/InvalidRequestError
    db_current_user = db.query(_user_models.User).filter(_user_models.User.id == current_user.id).first()
    
    # Ensure creator is always a member
    if db_current_user and db_current_user not in new_project.members:
        new_project.members.append(db_current_user)
        
    db.add(new_project)
    db.commit()
    db.refresh(new_project)
    return new_project

def update_project(db: Session, project_id: int, project_in: _schemas.ProjectUpdate, current_user: _user_models.User) -> _models.Project:
    if current_user.role != _user_models.UserRole.admin:
        raise HTTPException(status_code=403, detail="Only Admins can edit Projects.")
        
    project = get_project_or_404(db, project_id, current_user)
    
    if project_in.name is not None:
        project.name = project_in.name
    if project_in.description is not None:
        project.description = project_in.description
    if project_in.status is not None:
        project.status = project_in.status.value
        
    db.commit()
    db.refresh(project)
    return project

def delete_project(db: Session, project_id: int, current_user: _user_models.User):
    if current_user.role != _user_models.UserRole.admin:
        raise HTTPException(status_code=403, detail="Only Admins can delete Projects.")
        
    project = get_project_or_404(db, project_id, current_user)
    
    db.delete(project)
    db.commit()
    return {"detail": "Project deleted successfully"}

def add_members_to_project(db: Session, project_id: int, user_ids: List[int], current_user: _user_models.User) -> _models.Project:
    if current_user.role != _user_models.UserRole.admin:
        raise HTTPException(status_code=403, detail="Only Admins can modify Project Teams.")
        
    project = get_project_or_404(db, project_id, current_user)
    
    # Clear existing members and rebuild based on the new array
    project.members = []
    
    users = db.query(_user_models.User).filter(_user_models.User.id.in_(user_ids)).all()
    for u in users:
        project.members.append(u)
            
    db.commit()
    db.refresh(project)
    return project

def get_projects(db: Session, current_user: _user_models.User, skip: int = 0, limit: int = 50) -> List[_models.Project]:
    query = db.query(_models.Project).options(joinedload(_models.Project.members))
    
    if current_user.role != _user_models.UserRole.admin:
        # User sees projects they are explicitly in, OR projects where they have a task assigned to them, OR tasks they created
        query = query.outerjoin(_models.project_members).outerjoin(
            _models.Task, _models.Project.id == _models.Task.project_id
        ).filter(
            or_(
                _models.project_members.c.user_id == current_user.id,
                _models.Task.assignee_id == current_user.id,
                _models.Task.assigner_id == current_user.id
            )
        ).distinct()
        
    return query.order_by(desc(_models.Project.created_at)).offset(skip).limit(limit).all()


# ==========================================
# TASK SERVICES (Generic & Unrestricted)
# ==========================================

def get_task_or_404(db: Session, task_id: int) -> _models.Task:
    task = db.query(_models.Task).options(
        joinedload(_models.Task.assignee),
        joinedload(_models.Task.assigner)
    ).filter(_models.Task.id == task_id).first()
    
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task

def create_task(db: Session, task_in: _schemas.TaskCreate, current_user: _user_models.User, bg_tasks: BackgroundTasks) -> _models.Task:
    new_task = _models.Task(
        project_id=task_in.project_id if hasattr(task_in, 'project_id') else None,
        title=task_in.title,
        description=task_in.description,
        assigner_id=current_user.id,  # This user is the OWNER
        assignee_id=task_in.assignee_id,
        lead_id=task_in.lead_id,
        priority=task_in.priority,
        due_date=task_in.due_date
    )
    db.add(new_task)
    db.commit()
    db.refresh(new_task)

    if hasattr(task_in, 'attachments') and task_in.attachments:
        for att in task_in.attachments:
            db.add(_models.TaskAttachment(task_id=new_task.id, uploader_id=current_user.id, **att.dict()))
        db.commit()

    if new_task.assignee_id != current_user.id:
        try:
            notify_users(
                bg_tasks=bg_tasks,
                actor_id=current_user.id,
                recipient_ids=[new_task.assignee_id],
                title="New Task Assigned",
                body=f"You have been assigned to a new task: {new_task.title}",
                category="task",
                entity_type="task",
                entity_id=new_task.id
            )
        except Exception as e:
            print(f"Notification Error: {e}")
        
    return new_task

def update_task(db: Session, task_id: int, task_in: _schemas.TaskCreate, current_user: _user_models.User) -> _models.Task:
    task = get_task_or_404(db, task_id)
    
    task.title = task_in.title
    task.description = task_in.description
    task.assignee_id = task_in.assignee_id
    if hasattr(task_in, 'project_id'):
        task.project_id = task_in.project_id
    task.lead_id = task_in.lead_id
    task.priority = task_in.priority
    task.due_date = task_in.due_date

    db.commit()
    db.refresh(task)
    return task

def delete_task(db: Session, task_id: int, current_user: _user_models.User):
    task = get_task_or_404(db, task_id)
    
    # Security: ONLY the Owner (Assigner) or an Admin can delete a task.
    if current_user.role != _user_models.UserRole.admin and current_user.id != task.assigner_id:
        raise HTTPException(status_code=403, detail="Permission Denied. Only the Task Owner or Admin can delete this task.")
        
    db.delete(task)
    db.commit()
    return {"detail": "Task deleted successfully"}

def get_tasks(
    db: Session, current_user: _user_models.User, skip: int = 0, limit: int = 50,
    status: Optional[str] = None, project_id: Optional[int] = None
) -> dict:
    query = db.query(_models.Task).options(
        joinedload(_models.Task.assignee),
        joinedload(_models.Task.assigner)
    )
    
    if project_id: query = query.filter(_models.Task.project_id == project_id)
    if status: query = query.filter(_models.Task.status == status)
        
    total = query.count()
    tasks = query.order_by(desc(_models.Task.created_at)).offset(skip).limit(limit).all()
    
    return {"total": total, "skip": skip, "limit": limit, "tasks": tasks}

def get_task_detail(db: Session, task_id: int, current_user: _user_models.User) -> _models.Task:
    task = get_task_or_404(db, task_id)
    
    task.comments = db.query(_models.TaskComment).options(joinedload(_models.TaskComment.author)).filter(_models.TaskComment.task_id == task_id).order_by(_models.TaskComment.created_at.asc()).all()
    task.attachments = db.query(_models.TaskAttachment).options(joinedload(_models.TaskAttachment.uploader)).filter(_models.TaskAttachment.task_id == task_id).order_by(desc(_models.TaskAttachment.created_at)).all()
    return task

def update_task_status(db: Session, task_id: int, status_in: _schemas.TaskStatusUpdate, current_user: _user_models.User, bg_tasks: BackgroundTasks) -> _models.Task:
    task = get_task_or_404(db, task_id)
    old_status = task.status
    task.status = status_in.status.value
    db.commit()
    db.refresh(task)

    log_msg = _models.TaskComment(task_id=task.id, user_id=current_user.id, comment=f"Changed status from {old_status} to {task.status}", is_system_log=True)
    db.add(log_msg)
    db.commit()
    return task

def add_comment(db: Session, task_id: int, comment_in: _schemas.TaskCommentCreate, current_user: _user_models.User, bg_tasks: BackgroundTasks) -> _models.TaskComment:
    task = get_task_or_404(db, task_id)
    
    new_comment = _models.TaskComment(task_id=task.id, user_id=current_user.id, comment=comment_in.comment, is_system_log=False)
    db.add(new_comment)
    db.commit()
    db.refresh(new_comment)
    
    db_user = db.query(_user_models.User).get(current_user.id)
    new_comment.author = db_user
    return new_comment
    
def add_attachment(db: Session, task_id: int, attachment_in: _schemas.TaskAttachmentCreate, current_user: _user_models.User):
    task = get_task_or_404(db, task_id)
         
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
    
    sys_log = _models.TaskComment(
        task_id=task.id, user_id=current_user.id,
        comment=f"Attached a new file: {attachment_in.file_name or 'Media File'}",
        is_system_log=True
    )
    db.add(sys_log)
    db.commit()
    db.refresh(new_att)

    db_user = db.query(_user_models.User).get(current_user.id)
    new_att.uploader = db_user
    return new_att

def delete_attachment(db: Session, attachment_id: int, current_user: _user_models.User):
    attachment = db.query(_models.TaskAttachment).filter(_models.TaskAttachment.id == attachment_id).first()
    if not attachment:
        raise HTTPException(status_code=404, detail="Attachment not found")
        
    if current_user.role != _user_models.UserRole.admin and current_user.id != attachment.uploader_id:
        raise HTTPException(status_code=403, detail="Permission Denied. You can only delete your own attachments.")
        
    db.delete(attachment)
    db.commit()
    return {"detail": "Attachment deleted successfully"}