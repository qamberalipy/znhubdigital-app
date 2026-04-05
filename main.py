# main.py
import os
from typing import Annotated
from fastapi import (
    Depends,
    FastAPI,
    APIRouter,
    HTTPException,
    Request,
    status
)
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles 
from fastapi.security import (
    HTTPAuthorizationCredentials,
    HTTPBearer,
)
from starlette.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import jwt

# --- NEW: Firebase Admin SDK ---
import firebase_admin
from firebase_admin import credentials

# --- Import Custom Exception ---
from app.Shared.dependencies import HTML_LoginRequired

load_dotenv(".env")

JWT_SECRET = os.getenv("JWT_SECRET", "secret")
JWT_EXPIRY = os.getenv("JWT_EXPIRY", "")
ROOT_PATH = os.getenv("ROOT_PATH", "") 

# --- 1. IMPORT API ROUTERS ---
from app.core.main_router import router as main_router
from app.user import user_router
from app.task import task_router
from app.lead import lead_router
from app.signature import signature_router
from app.upload import upload_router
from app.content_vault import content_vault_router
from app.dashboard import dashboard_router
from app.announcement import announcement_router
from app.announcement.announcement import ws_router as announcement_ws_router 
from app.notification import notification_router
from app.notification import ws_router as notification_ws_router
from app.finance import finance_router
# --- NEW: Notification Router ---
# (Assumes you created app/notification/router.py as per previous instructions)
 

# --- 2. IMPORT WEB (HTML) ROUTERS ---
from app.web.routers import auth_views
from app.web.routers import user_views
from app.web.routers import task_views
from app.web.routers import signature_views
from app.web.routers import announcement_views
from app.web.routers import lead_views

# auto_error=False allows us to check for Cookie manually if Header is missing
bearer_scheme = HTTPBearer(auto_error=False)

async def authorization(
    request: Request,
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(bearer_scheme)] = None,
):
    token = None
    
    # Priority 1: Check Authorization Header (For Mobile App / Postman)
    if credentials:
        token = credentials.credentials
    
    # Priority 2: Check Cookie (For Web Dashboard)
    if not token:
        token = request.cookies.get("access_token")

    # If no token is found, we continue. 
    if not token:
        return

    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
        # Inject user data for user.py
        request.state.user = payload 

    except jwt.ExpiredSignatureError:
        print("Token has expired.")
        if credentials:
             raise HTTPException(status_code=401, detail="Token Expired")
    except jwt.InvalidTokenError:
        print("Token is invalid.")
        if credentials:
             raise HTTPException(status_code=401, detail="Invalid Token")
    except Exception as e:
        print(f"Token validation error: {e}")
        if credentials:
             raise HTTPException(status_code=401, detail="Authentication Error")

root_router = APIRouter(dependencies=[Depends(authorization)])

# --- NEW: Initialize Firebase ---
try:
    # Only initialize if not already initialized
    if not firebase_admin._apps:
        cred_path = "firebase-adminsdk.json" # Ensure this file exists in root
        if os.path.exists(cred_path):
            cred = credentials.Certificate(cred_path)
            firebase_admin.initialize_app(cred)
            print("✅ Firebase initialized successfully")
        else:
            print("⚠️ Warning: firebase-adminsdk.json not found. Mobile notifications will not work.")
except Exception as e:
    print(f"❌ Firebase init error: {e}")

app = FastAPI(
    title="GCH App APIs", 
    root_path=ROOT_PATH
)

# --- NEW: Exception Handler for Web Redirects ---
@app.exception_handler(HTML_LoginRequired)
async def login_required_handler(request: Request, exc: HTML_LoginRequired):
    """Redirects to Login Page if cookie is missing on a protected page."""
    return RedirectResponse(url="/", status_code=302)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=True,
)

# --- STATIC FILES ---
base_dir = os.path.dirname(os.path.abspath(__file__))
static_dir = os.path.join(base_dir, "static")

if os.path.isdir(static_dir):
    app.mount("/static", StaticFiles(directory=static_dir), name="static")
else:
    print(f"WARNING: static folder not found at {static_dir}")

# --- ROUTERS ---
app.include_router(auth_views.auth_view)    
app.include_router(user_views.user_view)
app.include_router(task_views.task_views)
app.include_router(lead_router)
app.include_router(signature_views.signature_views)
app.include_router(announcement_views.announcement_views)
app.include_router(lead_views.lead_view)  # <--- NEW: Lead Views
app.include_router(announcement_ws_router, prefix="/api/announcement")
app.include_router(notification_ws_router, prefix="/api/notification")

app.include_router(main_router)         
root_router.include_router(user_router) 
root_router.include_router(task_router)
root_router.include_router(signature_router)
root_router.include_router(content_vault_router)
root_router.include_router(dashboard_router)
root_router.include_router(upload_router)
root_router.include_router(announcement_router)
root_router.include_router(notification_router)
root_router.include_router(finance_router)

app.include_router(root_router)        

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)