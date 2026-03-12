# app/notification/notification.py
from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect, Body, status,Query
from sqlalchemy.orm import Session
from typing import List

import app.core.db.session as _database
from app.notification import service, schema
import app.user.user as _user_auth  # <--- CORRECT IMPORT
from app.Shared.helpers import decode_token 

# Define Routers
ws_router = APIRouter()
router = APIRouter()

def get_db():
    db = _database.SessionLocal()
    try: yield db
    finally: db.close()

# --- 1. WebSocket Endpoint ---
@ws_router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, db: Session = Depends(get_db), tags=["Notification API"]):
    """
    Real-time notification connection.
    Uses Manual Cookie Auth (same as Announcement module).
    """
    token = websocket.cookies.get("access_token")
    user_id = None
    
    if token:
        try:
            if token.startswith("Bearer "): 
                token = token.split(" ")[1]
            payload = decode_token(token)
            user_id = payload.get("sub") or payload.get("user_id")
        except Exception:
            pass 

    if not user_id:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    await service.ws_manager.connect(websocket, user_id)
    try:
        while True:
            await websocket.receive_text() # Keep connection alive
    except WebSocketDisconnect:
        service.ws_manager.disconnect(websocket, user_id)

# --- 2. REST Endpoints ---

@router.post("/device/token", response_model=dict, tags=["Notification API"])
def register_device(
    payload: schema.DeviceTokenCreate, 
    db: Session = Depends(get_db),
    current_user = Depends(_user_auth.get_current_user) # <--- CORRECT AUTH
):
    return service.register_device_token(db, current_user, payload)

@router.get("/", response_model=schema.PaginatedNotificationResponse, tags=["Notification API"])
def get_notifications(
    limit: int = 20,
    skip: int = 0,
    filter: str = Query("all", regex="^(all|unread)$"), # Validate input
    db: Session = Depends(get_db), 
    current_user = Depends(_user_auth.get_current_user)
):
    """
    Fetch notifications with pagination and filtering.
    """
    return service.get_my_notifications(db, current_user, filter, limit, skip)

@router.get("/unread-count", response_model=schema.UnreadCount, tags=["Notification API"])
def get_unread_count(
    db: Session = Depends(get_db), 
    current_user = Depends(_user_auth.get_current_user)
):
    return service.count_unread(db, current_user)

@router.put("/{id}/read", tags=["Notification API"])
def mark_read(
    id: int, 
    db: Session = Depends(get_db), 
    current_user = Depends(_user_auth.get_current_user)
):
    return service.mark_as_read(db, current_user, id)

@router.put("/mark-all-read", tags=["Notification API"])
def mark_all_read(
    db: Session = Depends(get_db),
    current_user = Depends(_user_auth.get_current_user)
):
    return service.mark_all_as_read(db, current_user)