# app/notification/service.py
from sqlalchemy.orm import Session
from fastapi import WebSocket, BackgroundTasks, WebSocketDisconnect
from typing import List, Dict, Any
import asyncio
import logging
from firebase_admin import messaging

from app.notification import models, schema
from app.user.models import User
import app.core.db.session as _database

# Initialize Logger
logger = logging.getLogger(__name__)

# ==============================================================================
# A. WebSocket Manager (Robust & Thread-Safe)
# ==============================================================================
class NotificationManager:
    def __init__(self):
        # Maps user_id (as STRING) -> List of WebSocket connections
        self.active_connections: Dict[str, List[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, user_id: int):
        try:
            await websocket.accept()
            # Force ID to string to ensure consistency (DB uses int, JWT might be str)
            uid = str(user_id)
            if uid not in self.active_connections:
                self.active_connections[uid] = []
            self.active_connections[uid].append(websocket)
            logger.info(f"WS Connected: User {uid} (Total sessions: {len(self.active_connections[uid])})")
        except Exception as e:
            logger.error(f"WS Connection Error for user {user_id}: {e}")

    def disconnect(self, websocket: WebSocket, user_id: int):
        uid = str(user_id)
        if uid in self.active_connections:
            if websocket in self.active_connections[uid]:
                self.active_connections[uid].remove(websocket)
            if not self.active_connections[uid]:
                del self.active_connections[uid]
            logger.info(f"WS Disconnected: User {uid}")

    async def broadcast_personal(self, message: dict, user_id: int):
        """
        Sends a message to a specific user's active connections.
        Handles stale connections gracefully.
        """
        uid = str(user_id) # Ensure lookup uses string key
        
        if uid in self.active_connections:
            # Iterate over a slice [:] to avoid 'RuntimeError: list changed size during iteration'
            connections = self.active_connections[uid][:]
            
            for connection in connections:
                try:
                    await connection.send_json(message)
                except (WebSocketDisconnect, RuntimeError) as e:
                    # Connection is dead, remove it
                    logger.warning(f"Removing dead connection for user {uid}: {e}")
                    self.disconnect(connection, user_id)
                except Exception as e:
                    logger.error(f"Unexpected WS Error for user {uid}: {e}")

ws_manager = NotificationManager()

# ==============================================================================
# B. Background FCM Worker (Mobile Push)
# ==============================================================================
def _send_fcm_background(tokens: List[str], title: str, body: str, data: dict):
    if not tokens: return
    
    # Process in batches of 500 (Firebase limit)
    batch_limit = 500
    for i in range(0, len(tokens), batch_limit):
        chunk = tokens[i : i + batch_limit]
        try:
            message = messaging.MulticastMessage(
                notification=messaging.Notification(title=title, body=body),
                data=data,
                tokens=chunk
            )
            response = messaging.send_multicast(message)
            # Optional: Log success count if needed
            # logger.info(f"FCM Batch Sent: {response.success_count} success")
        except Exception as e:
            logger.error(f"FCM Send Error: {e}")

# ==============================================================================
# C. Core CRUD Logic
# ==============================================================================

def register_device_token(db: Session, user: User, payload: schema.DeviceTokenCreate):
    try:
        existing = db.query(models.UserDevice).filter(models.UserDevice.fcm_token == payload.token).first()
        if existing:
            existing.user_id = user.id
            existing.platform = payload.platform
        else:
            new_device = models.UserDevice(user_id=user.id, fcm_token=payload.token, platform=payload.platform)
            db.add(new_device)
        db.commit()
        return {"message": "Device registered successfully"}
    except Exception as e:
        db.rollback()
        logger.error(f"Device Register Error: {e}")
        return {"message": "Error registering device"}

def get_my_notifications(
    db: Session, 
    user: User, 
    filter_type: str = "all",
    limit: int = 20, 
    skip: int = 0
):
    try:
        query = db.query(models.Notification).filter(models.Notification.recipient_id == user.id)
        
        if filter_type == "unread":
            query = query.filter(models.Notification.is_read == False)
        
        query = query.order_by(models.Notification.is_read.asc(), models.Notification.created_at.desc())
        
        notifications = query.offset(skip).limit(limit).all()
        
        unread_count = db.query(models.Notification).filter(
            models.Notification.recipient_id == user.id, 
            models.Notification.is_read == False
        ).count()

        return {
            "total_unread": unread_count,
            "items": notifications,
            "next_cursor": None 
        }
    except Exception as e:
        logger.error(f"Fetch Notifications Error: {e}")
        return {"total_unread": 0, "items": []}

def count_unread(db: Session, user: User):
    count = db.query(models.Notification)\
              .filter(models.Notification.recipient_id == user.id, models.Notification.is_read == False)\
              .count()
    return {"count": count}

def mark_as_read(db: Session, user: User, notification_id: int):
    try:
        notif = db.query(models.Notification).filter(
            models.Notification.id == notification_id, 
            models.Notification.recipient_id == user.id
        ).first()
        if notif:
            notif.is_read = True
            db.commit()
            return {"status": "success"}
        return {"status": "not_found"}
    except Exception as e:
        db.rollback()
        logger.error(f"Mark Read Error: {e}")
        return {"status": "error"}

def mark_all_as_read(db: Session, user: User):
    try:
        db.query(models.Notification)\
          .filter(models.Notification.recipient_id == user.id, models.Notification.is_read == False)\
          .update({models.Notification.is_read: True}, synchronize_session=False)
        db.commit()
        return {"status": "success"}
    except Exception as e:
        db.rollback()
        logger.error(f"Mark All Read Error: {e}")
        return {"status": "error"}

# ==============================================================================
# D. Unified Sender (The Engine)
# ==============================================================================

async def send_smart_notification(
    db: Session,
    recipient_ids: List[int],
    title: str,
    body: str,
    background_tasks: BackgroundTasks,
    category: models.NotificationCategory,
    severity: models.NotificationSeverity,
    entity_type: str = "general",
    entity_id: int = None,
    click_url: str = "/",
    actor_id: int = None
):
    """
    1. Saves to DB (Bulk).
    2. Broadcasts via WebSocket (Real-time).
    3. Queues Mobile Push (FCM).
    """
    valid_ids = list(set(recipient_ids))
    if not valid_ids: return

    # 1. Bulk DB Insert
    new_notifs = []
    for uid in valid_ids:
        new_notifs.append(models.Notification(
            recipient_id=uid,
            actor_id=actor_id,
            title=title,
            body=body,
            category=category.value,
            severity=severity.value,
            entity_type=entity_type,
            entity_id=entity_id,
            click_action_link=click_url
        ))
    
    try:
        db.add_all(new_notifs)
        db.commit() # Flush to get IDs
    except Exception as e:
        logger.error(f"Notification DB Insert Error: {e}")
        db.rollback()
        return

    # 2. WebSocket Broadcast
    # We loop through the saved objects to get their specific IDs and Timestamps
    for notif in new_notifs:
        ws_payload = {
            "id": notif.id,
            "title": title,
            "body": body,
            "category": category.value,
            "severity": severity.value,
            "click_action_link": click_url,
            "entity_id": str(entity_id),
            "created_at": notif.created_at.isoformat() if notif.created_at else None
        }
        
        # ID casting to str handled inside broadcast_personal
        await ws_manager.broadcast_personal({"type": "new_notification", "data": ws_payload}, notif.recipient_id)

    # 3. Mobile Push (Async Background Task)
    # Only for High or Critical priority to save resources/quota
    if severity in [models.NotificationSeverity.HIGH, models.NotificationSeverity.CRITICAL]:
        try:
            devices = db.query(models.UserDevice).filter(models.UserDevice.user_id.in_(valid_ids)).all()
            if devices:
                tokens = [d.fcm_token for d in devices]
                fcm_data = {
                    "click_action": "FLUTTER_NOTIFICATION_CLICK",
                    "route": click_url,
                    "category": category.value,
                    "entity_id": str(entity_id) if entity_id else ""
                }
                background_tasks.add_task(_send_fcm_background, tokens, title, body, fcm_data)
        except Exception as e:
            logger.error(f"Error preparing FCM tasks: {e}")

    return True

# ==============================================================================
# E. Public Interface (The Wrapper)
# ==============================================================================

def notify_users(
    background_tasks: BackgroundTasks,
    recipient_ids: List[int],
    title: str,
    body: str,
    category: models.NotificationCategory,
    severity: models.NotificationSeverity,
    entity_id: int = None,
    click_url: str = "/",
    actor_id: int = None
):
    """
    Wrapper to ensure notification runs on the main event loop
    while keeping the DB session independent.
    """
    async def async_notification_wrapper():
        db = _database.SessionLocal()
        try:
            await send_smart_notification(
                db=db,
                recipient_ids=recipient_ids,
                title=title,
                body=body,
                background_tasks=background_tasks,
                category=category,
                severity=severity,
                entity_type=category.value,
                entity_id=entity_id,
                click_url=click_url,
                actor_id=actor_id
            )
        except Exception as e:
            logger.error(f"Error in Notification Wrapper: {e}")
        finally:
            db.close()

    background_tasks.add_task(async_notification_wrapper)