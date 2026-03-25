# app/dashboard/service.py
from sqlalchemy.orm import Session
from sqlalchemy import desc
from datetime import datetime

# Import Models from existing apps
from app.user.models import User, UserRole
from app.task.models import Task, TaskStatus, ContentVault
from app.signature.models import SignatureRequest, SignatureStatus

def get_dashboard_stats(db: Session, current_user: User):
    now = datetime.now()
    
    # --- 1. Hierarchy Filter Helper ---
    def filter_by_role(query, model):
        """Filters query based on the current user's hierarchy."""
        # Determine which user field to check (assignee for Tasks, signer for Docs)
        user_field = model.assignee_id if hasattr(model, 'assignee_id') else model.signer_id
        
        # if current_user.role == UserRole.admin:
        #     return query
            
        # elif current_user.role == UserRole.manager:
        #     # Manager sees their direct reports
        #     return query.join(User, user_field == User.id)\
        #                 .filter(User.manager_id == current_user.id)
                        
        # elif current_user.role == UserRole.team_member:
        #     # Team Member sees their assigned Creator
        #     target_id = current_user.assigned_model_id or 0
        #     return query.filter(user_field == target_id)
            
        # elif current_user.role == UserRole.digital_creator:
        #     # Creator sees only themselves
        #     return query.filter(user_field == current_user.id)
            
        return query

    # --- 2. Base Queries ---
    task_q = filter_by_role(db.query(Task), Task)
    doc_q = filter_by_role(db.query(SignatureRequest), SignatureRequest)

    # --- 3. Calculate Metrics ---
    
    # Counts
    overdue_count = task_q.filter(Task.due_date < now, Task.status != TaskStatus.completed.value).count()
    blocked_count = task_q.filter(Task.status == TaskStatus.blocked.value).count()
    unsigned_count = doc_q.filter(SignatureRequest.status == SignatureStatus.pending.value).count()
    
    # Logic for Total Missing Content
    active_tasks = task_q.filter(Task.status != TaskStatus.completed.value).all()
    total_missing = 0
    user_missing_map = {}

    for t in active_tasks:
        uploaded = len(t.attachments)
        if t.req_quantity > uploaded:
            diff = t.req_quantity - uploaded
            total_missing += diff
            
            # Group by User for the List Widget
            uid = t.assignee_id
            if uid not in user_missing_map:
                # Handle case where assignee might be deleted/null
                name = t.assignee.full_name if t.assignee else "Unknown"
                user_missing_map[uid] = {"name": name, "count": 0}
            user_missing_map[uid]["count"] += diff

    # --- 4. Lists ---
    
    # Missing Content List (Top 5)
    missing_list_data = sorted(user_missing_map.values(), key=lambda x: x['count'], reverse=True)[:5]

    # Recent Documents (Top 5)
    recent_docs = doc_q.order_by(desc(SignatureRequest.created_at)).limit(5).all()
    doc_list_data = []
    for d in recent_docs:
        badge = "badge-unassigned"
        if d.status == SignatureStatus.pending.value:
            if d.deadline and d.deadline < now:
                badge = "badge-expired"
            else:
                badge = "badge-soon"
        elif d.status == SignatureStatus.signed.value:
            badge = "status-badge" # Default gray
            
        doc_list_data.append({
            "user_name": d.signer.full_name if d.signer else "Unknown",
            "doc_name": d.title,
            "status": d.status,
            "badge_class": badge
        })

    # --- 5. Completion Rate ---
    total_scope_tasks = task_q.count() or 1
    completed_scope_tasks = task_q.filter(Task.status == TaskStatus.completed.value).count()
    completion_rate = round((completed_scope_tasks / total_scope_tasks) * 100)

    # --- 6. Time Stats (Avg Days) ---
    completed_tasks_set = task_q.filter(Task.status == TaskStatus.completed.value)\
                                .filter(Task.completed_at != None)\
                                .order_by(desc(Task.completed_at)).limit(50).all()
    
    total_seconds = 0
    count_calc = 0
    for t in completed_tasks_set:
        if t.created_at and t.completed_at:
            # --- FIX STARTS HERE ---
            # created_at is timezone-aware, completed_at is naive.
            # We strip the timezone info from created_at to match completed_at
            start_time = t.created_at
            if start_time.tzinfo is not None and t.completed_at.tzinfo is None:
                start_time = start_time.replace(tzinfo=None)
            
            delta = t.completed_at - start_time
            # --- FIX ENDS HERE ---
            
            total_seconds += delta.total_seconds()
            count_calc += 1
            
    avg_days = round((total_seconds / count_calc) / 86400, 1) if count_calc > 0 else 0.0

    return {
        "metrics": {
            "overdue": overdue_count,
            "missing": total_missing,
            "unsigned": unsigned_count,
            "blocked": blocked_count
        },
        "completion": {
            "overall_rate": completion_rate
        },
        "lists": {
            "missing_content": missing_list_data,
            "documents": doc_list_data
        },
        "time": {
            "avg_days": avg_days
        }
    }