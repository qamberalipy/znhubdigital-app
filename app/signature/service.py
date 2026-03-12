import datetime
from sqlalchemy import desc, or_
from sqlalchemy.orm import Session, joinedload, aliased
from sqlalchemy.exc import SQLAlchemyError
from fastapi import HTTPException, status, BackgroundTasks
from typing import List, Optional, Set

import app.signature.models as _models
import app.user.models as _user_models
import app.signature.schema as _schemas
import app.notification.models as _notif_models 
from app.notification.service import notify_users 

# --- Helpers ---

def _get_admin_ids(db: Session) -> Set[int]:
    """
    Optimized: Fetches only IDs (not full objects) and returns a Set for fast lookup.
    """
    admin_tuples = db.query(_user_models.User.id).filter(
        _user_models.User.role == _user_models.UserRole.admin,
        _user_models.User.is_deleted == False
    ).all()
    return {a[0] for a in admin_tuples}

def _get_hierarchy_recipients(db: Session, actor: _user_models.User) -> Set[int]:
    """
    Optimized: Calculates hierarchy recipients (Manager + Admins) based on the actor.
    Usage: Pass the person who performed the action (or the Assignee/Requester depending on flow).
    """
    recipients = _get_admin_ids(db)
    
    # If Actor is a Team Member, notify their Manager
    if actor.role == _user_models.UserRole.team_member and actor.manager_id:
        recipients.add(actor.manager_id)
        
    # If Actor is a Manager, they are already included if they are the target, 
    # but if they are the *origin*, they usually don't need a self-notification 
    # unless specifically requested. 
    # (In your Task module, you added the Manager explicitly if they were the assigner, 
    # assuming they want a copy. We keep that logic here).
    if actor.role == _user_models.UserRole.manager:
        recipients.add(actor.id)

    return recipients

def get_signature_request_or_404(db: Session, request_id: int):
    # Optimized: Eagerly loads Requester and Signer to prevent N+1 queries later
    req = db.query(_models.SignatureRequest).options(
        joinedload(_models.SignatureRequest.requester),
        joinedload(_models.SignatureRequest.signer)
    ).filter(_models.SignatureRequest.id == request_id).first()
    
    if not req:
        raise HTTPException(status_code=404, detail=f"Signature request {request_id} not found")
    return req

# --- 1. Create Signature Request ---
def create_signature_request(
    db: Session, 
    request_in: _schemas.SignatureCreate, 
    current_user: _user_models.User,
    background_tasks: BackgroundTasks
):
    signer = db.query(_user_models.User).filter(
        _user_models.User.id == request_in.signer_id,
        _user_models.User.role == _user_models.UserRole.digital_creator,
        _user_models.User.is_deleted == False
    ).first()
    
    if not signer:
        raise HTTPException(status_code=400, detail="Invalid or Deleted Digital Creator.")

    # RBAC Hierarchy Check
    if current_user.role != _user_models.UserRole.admin:
        if current_user.role == _user_models.UserRole.team_member:
            if current_user.assigned_model_id != signer.id:
                raise HTTPException(status_code=403, detail="You can only request signatures from your assigned Digital Creator.")
        elif current_user.role == _user_models.UserRole.manager:
            if signer.manager_id != current_user.id:
                raise HTTPException(status_code=403, detail="You can only request signatures from creators in your team.")
        elif current_user.role == _user_models.UserRole.digital_creator:
             raise HTTPException(status_code=403, detail="Digital Creators cannot create signature requests.")

    try:
        new_request = _models.SignatureRequest(
            requester_id=current_user.id,
            signer_id=request_in.signer_id,
            title=request_in.title,
            description=request_in.description,
            document_url=request_in.document_url,
            deadline=request_in.deadline,
            status=_models.SignatureStatus.pending.value
        )

        db.add(new_request)
        db.commit()
        db.refresh(new_request)

        # [NOTIFICATION]
        try:
            # 1. Notify the Signer
            recipients = {new_request.signer_id}
            
            # 2. Add Hierarchy (Admins + Manager of the Requester)
            hierarchy_recipients = _get_hierarchy_recipients(db, current_user)
            recipients.update(hierarchy_recipients)

            notify_users(
                background_tasks=background_tasks,
                recipient_ids=list(recipients),
                title="Signature Requested",
                body=f"{current_user.full_name} requests signature: {new_request.title}",
                category=_notif_models.NotificationCategory.DOC_SIGN,
                severity=_notif_models.NotificationSeverity.NORMAL,
                entity_id=new_request.id,
                click_url="/signature_requests",
                actor_id=current_user.id
            )
        except Exception as e:
            print(f"Notification Error: {e}")

        return new_request

    except SQLAlchemyError as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"DB Error: {str(e)}")

# --- 2. List Signature Requests ---
def get_all_signature_requests(
    db: Session, 
    current_user: _user_models.User, 
    skip: int = 0, 
    limit: int = 10, 
    status: Optional[str] = None,
    search: Optional[str] = None
):
    try:
        query = db.query(_models.SignatureRequest).options(
            joinedload(_models.SignatureRequest.requester),
            joinedload(_models.SignatureRequest.signer)
        )

        if current_user.role == _user_models.UserRole.digital_creator:
            query = query.filter(_models.SignatureRequest.signer_id == current_user.id)
        elif current_user.role == _user_models.UserRole.manager:
            SignerUser = aliased(_user_models.User)
            query = query.join(SignerUser, _models.SignatureRequest.signer).filter(
                SignerUser.manager_id == current_user.id
            )
        elif current_user.role == _user_models.UserRole.team_member:
            if current_user.assigned_model_id:
                query = query.filter(_models.SignatureRequest.signer_id == current_user.assigned_model_id)
            else:
                return {"total": 0, "skip": skip, "limit": limit, "data": []}

        if status:
            query = query.filter(_models.SignatureRequest.status == status)
        
        if search:
            search_term = f"%{search}%"
            query = query.join(_models.SignatureRequest.signer).filter(
                or_(
                    _models.SignatureRequest.title.ilike(search_term),
                    _user_models.User.full_name.ilike(search_term)
                )
            )

        total_records = query.count()
        data = query.order_by(desc(_models.SignatureRequest.created_at))\
                    .offset(skip)\
                    .limit(limit)\
                    .all()

        return {"total": total_records, "skip": skip, "limit": limit, "data": data}

    except SQLAlchemyError as e:
        raise HTTPException(status_code=500, detail=f"DB Error: {str(e)}")

# --- 3. Get Single Request ---
def get_signature_request(db: Session, request_id: int, current_user: _user_models.User):
    req = get_signature_request_or_404(db, request_id)

    is_admin = current_user.role == _user_models.UserRole.admin
    is_requester = req.requester_id == current_user.id
    is_signer = req.signer_id == current_user.id
    
    has_hierarchy_access = False
    if current_user.role == _user_models.UserRole.manager and req.signer.manager_id == current_user.id:
        has_hierarchy_access = True
    if current_user.role == _user_models.UserRole.team_member and current_user.assigned_model_id == req.signer_id:
        has_hierarchy_access = True

    if not (is_admin or is_requester or is_signer or has_hierarchy_access):
        raise HTTPException(status_code=403, detail="Not authorized to view this document.")
    
    return req

# --- 4. Sign Document ---
def sign_document(
    db: Session, 
    request_id: int, 
    sign_in: _schemas.SignatureSign, 
    current_user: _user_models.User, 
    ip_address: str,
    background_tasks: BackgroundTasks
):
    # Fetch Request (Requester is already loaded here!)
    req = get_signature_request_or_404(db, request_id)

    if req.signer_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the assigned Digital Creator can sign this document.")

    if req.status != _models.SignatureStatus.pending.value:
        raise HTTPException(status_code=400, detail="Document is already processed or expired.")

    try:
        req.signed_legal_name = sign_in.legal_name
        req.signed_at = datetime.datetime.utcnow()
        req.signer_ip_address = ip_address
        req.status = _models.SignatureStatus.signed.value

        db.commit()
        db.refresh(req)

        # [NOTIFICATION]
        try:
            # 1. Notify Requester
            recipients = {req.requester_id}
            
            # 2. Add Hierarchy (Admins + Manager of the Requester)
            # OPTIMIZATION: Use req.requester directly, NO new DB query needed
            hierarchy_recipients = _get_hierarchy_recipients(db, req.requester)
            recipients.update(hierarchy_recipients)

            notify_users(
                background_tasks=background_tasks,
                recipient_ids=list(recipients),
                title="Document Signed",
                body=f"{current_user.full_name} signed '{req.title}'",
                category=_notif_models.NotificationCategory.DOC_SIGN,
                severity=_notif_models.NotificationSeverity.HIGH,
                entity_id=req.id,
                click_url="/signature_requests",
                actor_id=current_user.id
            )
        except Exception as e:
            print(f"Notification Error: {e}")

        return req
    except SQLAlchemyError as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Signing failed: {str(e)}")

# --- 5. Update Request ---
def update_signature_request(
    db: Session, 
    request_id: int, 
    updates: _schemas.SignatureUpdate, 
    current_user: _user_models.User
):
    req = get_signature_request_or_404(db, request_id)
    
    if current_user.role != _user_models.UserRole.admin and req.requester_id != current_user.id:
        raise HTTPException(status_code=403, detail="You cannot edit this request.")

    if req.status == _models.SignatureStatus.signed.value:
         raise HTTPException(status_code=400, detail="Cannot edit a document that has already been signed.")

    try:
        update_data = updates.dict(exclude_unset=True)
        for key, value in update_data.items():
            setattr(req, key, value)
        
        db.commit()
        db.refresh(req)
        return req
    except SQLAlchemyError as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Update failed: {str(e)}")

# --- 6. Delete Request ---
def delete_signature_request(
    db: Session, 
    request_id: int, 
    current_user: _user_models.User,
    background_tasks: BackgroundTasks
):
    req = get_signature_request_or_404(db, request_id)
    
    if current_user.role != _user_models.UserRole.admin and req.requester_id != current_user.id:
        raise HTTPException(status_code=403, detail="You cannot delete this request.")
            
    if req.status == _models.SignatureStatus.signed.value:
         raise HTTPException(status_code=400, detail="Cannot delete a signed legal document.")

    signer_id = req.signer_id
    req_title = req.title

    try:
        db.delete(req)
        db.commit()

        # [NOTIFICATION: Cancelled]
        if signer_id != current_user.id:
            try:
                notify_users(
                    background_tasks=background_tasks,
                    recipient_ids=[signer_id],
                    title="Request Cancelled",
                    body=f"Signature request '{req_title}' was removed",
                    category=_notif_models.NotificationCategory.DOC_SIGN,
                    severity=_notif_models.NotificationSeverity.NORMAL,
                    entity_id=0,
                    click_url="/signature_requests",
                    actor_id=current_user.id
                )
            except Exception as e:
                print(f"Notification Error: {e}")

        return {"message": "Request deleted successfully"}
    except SQLAlchemyError as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Delete failed: {str(e)}")