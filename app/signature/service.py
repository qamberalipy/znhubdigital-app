import datetime
from sqlalchemy import desc, or_
from sqlalchemy.orm import Session, joinedload
from sqlalchemy.exc import SQLAlchemyError
from fastapi import HTTPException, status, BackgroundTasks
from typing import Optional, Set

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
        _user_models.User.is_deleted == False,
        _user_models.User.account_status == _user_models.AccountStatus.active
    ).all()
    return {a[0] for a in admin_tuples}

def _get_hierarchy_recipients(db: Session, actor_id: int) -> Set[int]:
    """
    ZN Hub Flatter Hierarchy: Notifies Admins for major actions.
    If the actor is an admin, they are already handling it, but it keeps a paper trail.
    """
    recipients = _get_admin_ids(db)
    # Ensure the actor doesn't redundantly notify themselves
    if actor_id in recipients:
        recipients.remove(actor_id)
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
    # Security: Prevent clients from creating signature requests
    if current_user.role == _user_models.UserRole.client:
        raise HTTPException(status_code=403, detail="Clients are not authorized to create signature requests.")

    signer = db.query(_user_models.User).filter(
        _user_models.User.id == request_in.signer_id,
        _user_models.User.is_deleted == False
    ).first()
    
    if not signer:
        raise HTTPException(status_code=400, detail="Invalid or Deleted User.")

    # Business Logic: Only assign to clients. (Remove this check if staff-to-staff signing is needed)
    if signer.role != _user_models.UserRole.client:
        raise HTTPException(status_code=400, detail="Signature requests can only be sent to Clients.")

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

        # [NOTIFICATION ENGINE]
        try:
            recipients = {new_request.signer_id}
            # CC Admins on new requests for oversight
            recipients.update(_get_hierarchy_recipients(db, current_user.id))

            notify_users(
                background_tasks=background_tasks,
                recipient_ids=list(recipients),
                title="Action Required: Signature Requested",
                body=f"{current_user.full_name} has requested your signature on: {new_request.title}",
                category=_notif_models.NotificationCategory.DOC_SIGN,
                severity=_notif_models.NotificationSeverity.NORMAL,
                entity_id=new_request.id,
                click_url="/signature_requests",
                actor_id=current_user.id
            )
        except Exception as e:
            # Log this in a real logger for production
            print(f"Notification Dispatch Error: {e}")

        return new_request

    except SQLAlchemyError as e:
        db.rollback()
        raise HTTPException(status_code=500, detail="Database integrity error while creating the request.")

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

        # RBAC Query Filtering
        if current_user.role == _user_models.UserRole.client:
            # Clients ONLY see documents assigned to them
            query = query.filter(_models.SignatureRequest.signer_id == current_user.id)
        elif current_user.role != _user_models.UserRole.admin:
            query = query.filter(_models.SignatureRequest.requester_id == current_user.id)

        if status:
            query = query.filter(_models.SignatureRequest.status == status)
        
        # Optional Search Filter (Searches Title or Signer's Name)
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
        raise HTTPException(status_code=500, detail="Error fetching signature requests.")

# --- 3. Get Single Request ---
def get_signature_request(db: Session, request_id: int, current_user: _user_models.User):
    req = get_signature_request_or_404(db, request_id)

    # Access Verification
    is_admin = current_user.role == _user_models.UserRole.admin
    is_requester = req.requester_id == current_user.id
    is_signer = req.signer_id == current_user.id

    if not (is_admin or is_requester or is_signer):
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
    req = get_signature_request_or_404(db, request_id)

    if req.signer_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the designated client can sign this document.")

    if req.status != _models.SignatureStatus.pending.value:
        raise HTTPException(status_code=400, detail="This document has already been processed or is expired.")

    try:
        req.signed_legal_name = sign_in.legal_name
        req.signed_at = datetime.datetime.utcnow()
        req.signer_ip_address = ip_address
        req.status = _models.SignatureStatus.signed.value

        db.commit()
        db.refresh(req)

        # [NOTIFICATION ENGINE]
        try:
            # Notify the Staff member who requested it
            recipients = {req.requester_id}
            # CC Admins
            recipients.update(_get_hierarchy_recipients(db, current_user.id))

            notify_users(
                background_tasks=background_tasks,
                recipient_ids=list(recipients),
                title="Document Signed Successfully",
                body=f"Client '{current_user.full_name}' has signed '{req.title}'",
                category=_notif_models.NotificationCategory.DOC_SIGN,
                severity=_notif_models.NotificationSeverity.HIGH,
                entity_id=req.id,
                click_url="/signature_requests",
                actor_id=current_user.id
            )
        except Exception as e:
            print(f"Notification Dispatch Error: {e}")

        return req
    except SQLAlchemyError as e:
        db.rollback()
        raise HTTPException(status_code=500, detail="Cryptographic or Database error during signature binding.")

# --- 5. Update Request ---
def update_signature_request(
    db: Session, 
    request_id: int, 
    updates: _schemas.SignatureUpdate, 
    current_user: _user_models.User
):
    req = get_signature_request_or_404(db, request_id)
    
    if current_user.role != _user_models.UserRole.admin and req.requester_id != current_user.id:
        raise HTTPException(status_code=403, detail="You do not have permission to modify this request.")

    if req.status != _models.SignatureStatus.pending.value:
         raise HTTPException(status_code=400, detail="Modifications cannot be made to a document that is no longer pending.")

    try:
        update_data = updates.dict(exclude_unset=True)
        for key, value in update_data.items():
            setattr(req, key, value)
        
        db.commit()
        db.refresh(req)
        return req
    except SQLAlchemyError as e:
        db.rollback()
        raise HTTPException(status_code=500, detail="Update failed due to a database error.")

# --- 6. Delete Request ---
def delete_signature_request(
    db: Session, 
    request_id: int, 
    current_user: _user_models.User,
    background_tasks: BackgroundTasks
):
    req = get_signature_request_or_404(db, request_id)
    
    if current_user.role != _user_models.UserRole.admin and req.requester_id != current_user.id:
        raise HTTPException(status_code=403, detail="You do not have permission to delete this request.")
            
    if req.status == _models.SignatureStatus.signed.value:
         raise HTTPException(status_code=400, detail="Legal compliance failure: Cannot delete an executed legal document.")

    signer_id = req.signer_id
    req_title = req.title

    try:
        db.delete(req)
        db.commit()

        # [NOTIFICATION ENGINE: Cancellation]
        if signer_id != current_user.id:
            try:
                notify_users(
                    background_tasks=background_tasks,
                    recipient_ids=[signer_id],
                    title="Signature Request Cancelled",
                    body=f"The signature request for '{req_title}' has been revoked by the issuer.",
                    category=_notif_models.NotificationCategory.DOC_SIGN,
                    severity=_notif_models.NotificationSeverity.NORMAL,
                    entity_id=0,
                    click_url="/signature_requests",
                    actor_id=current_user.id
                )
            except Exception as e:
                print(f"Notification Dispatch Error: {e}")

        return {"message": "Signature request successfully deleted."}
    except SQLAlchemyError as e:
        db.rollback()
        raise HTTPException(status_code=500, detail="Deletion failed due to a database error.")