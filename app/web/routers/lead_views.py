# app/web/routers/lead_views.py
from fastapi import APIRouter, Request, Depends
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from app.Shared.dependencies import protected_view, get_menu_context # Import helpers

templates = Jinja2Templates(directory="templates")

# --- FIX 1: Add Dependency to Protect All Routes ---
lead_view = APIRouter(include_in_schema=False, dependencies=[Depends(protected_view)])

# app/web/routers/lead_views.py

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

@lead_view.get("/view-lead")
async def dashboard_view(request: Request):
    context = get_template_context(request)
    return templates.TemplateResponse("lead/lead_board.html", context) 

