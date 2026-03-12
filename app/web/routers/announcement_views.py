# app/web/routers/announcement_views.py
from fastapi import APIRouter, Request, Depends
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from app.Shared.dependencies import protected_view, get_menu_context # Import helpers

templates = Jinja2Templates(directory="templates")

# --- FIX 1: Add Dependency to Protect All Routes ---
announcement_views = APIRouter(include_in_schema=False, dependencies=[Depends(protected_view)])

# app/web/routers/announcement_views.py

def get_template_context(request: Request):
    menu = get_menu_context(request)
    user = getattr(request.state, "user", {})

    return {
        "request": request, 
        "menu": menu,
        "session_user_name": user.get("name", "User"), 
        "session_user_role": user.get("role", ""),
        "session_user_pic": user.get("picture", None),
        "session_user_id": user.get("user_id", "")  # <--- NEW: Pass ID to Template
    }

@announcement_views.get("/admin_feed")
async def admin_feed(request: Request):
    context = get_template_context(request)
    return templates.TemplateResponse("announcement/admin_feed.html", context) 