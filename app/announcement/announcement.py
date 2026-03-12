# app/announcement/announcement.py
from fastapi import APIRouter, Depends, HTTPException, Body, WebSocket, WebSocketDisconnect, Query, status
from sqlalchemy.orm import Session
from typing import List, Optional
import json

import app.core.db.session as _database
import app.user.user as _user_auth
from app.announcement import service, schema
from app.user.models import User
# IMPORTANT: Ensure this import exists for the manual auth fix
from app.Shared.helpers import decode_token 

# --- 1. WebSocket Connection Manager ---
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        # Iterate over a copy to avoid modification errors
        for connection in self.active_connections[:]:
            try:
                await connection.send_json(message)
            except Exception:
                self.disconnect(connection)

manager = ConnectionManager()

def get_db():
    db = _database.SessionLocal()
    try: yield db
    finally: db.close()

ws_router = APIRouter()
router = APIRouter()

# --- WebSocket Endpoint (Unchanged) ---
@ws_router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, db: Session = Depends(get_db), tags=["Announcement API"]):
    token = websocket.cookies.get("access_token")
    user = None
    if token:
        try:
            if token.startswith("Bearer "): token = token.split(" ")[1]
            payload = decode_token(token)
            user_id = payload.get("sub") or payload.get("user_id")
            if user_id:
                user = db.query(User).filter(User.id == user_id).first()
        except Exception:
            pass 
    if not user:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return
    await manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)

# --- 3. REST Endpoints (Broadcasts Added) ---

@router.post("/preview-link", tags=["Announcement API"])
def preview_link(
    body: dict = Body(...),
    current_user = Depends(_user_auth.get_current_user)
):
    url = body.get("url")
    return service.fetch_url_metadata(url) if url else {}

@router.post("/", response_model=schema.AnnouncementResponse, tags=["Announcement API"])
async def create_post(
    data: schema.AnnouncementCreate,
    db: Session = Depends(get_db),
    current_user = Depends(_user_auth.get_current_user)
):
    new_post = service.create_announcement(db, data, current_user)
    
    # Broadcast New Post
    try:
        post_data = schema.AnnouncementResponse.from_orm(new_post).dict()
    except AttributeError:
        post_data = schema.AnnouncementResponse.from_orm(new_post).model_dump()
        
    if post_data.get('created_at'): 
        post_data['created_at'] = str(post_data['created_at'])
    
    await manager.broadcast({"type": "new_post", "data": post_data})
    return new_post

@router.get("/", response_model=list[schema.AnnouncementResponse], tags=["Announcement API"])
def get_feed(
    last_id: Optional[int] = Query(None, description="ID of the last loaded post"),
    direction: int = Query(0, description="0=Latest, 1=Older (Scroll Down), 2=Newer (Scroll Up)"), # <--- ADDED
    limit: int = 20,
    db: Session = Depends(get_db),
    current_user = Depends(_user_auth.get_current_user)
):
    """
    Get announcement feed with direction support.
    """
    return service.get_feed(db, direction, last_id, limit)

@router.delete("/{id}", tags=["Announcement API"])
async def delete_post(
    id: int,
    db: Session = Depends(get_db),
    current_user = Depends(_user_auth.get_current_user)
):
    result = service.delete_announcement(db, id, current_user)
    
    # Broadcast Deletion
    await manager.broadcast({"type": "delete_post", "id": id})
    
    return result

# ... (Keep react_to_post, mark_viewed, get_viewers as they are)
@router.post("/{id}/react", tags=["Announcement API"])
def react_to_post(
    id: int, 
    reaction: schema.ReactionCreate,
    db: Session = Depends(get_db),
    current_user = Depends(_user_auth.get_current_user)
):
    return service.toggle_reaction(db, id, reaction.emoji, current_user)

@router.post("/{id}/view", tags=["Announcement API"])
def mark_viewed(
    id: int,
    db: Session = Depends(get_db),
    current_user = Depends(_user_auth.get_current_user)
):
    return service.mark_as_viewed(db, id, current_user)

@router.get("/{id}/viewers", response_model=list[schema.ViewerResponse], tags=["Announcement API"])
def get_viewers(
    id: int,
    db: Session = Depends(get_db),
    current_user = Depends(_user_auth.get_current_user)
):
    if current_user.role not in ["admin", "manager"]:
         raise HTTPException(status_code=403, detail="Not authorized")
    return service.get_post_viewers(db, id)