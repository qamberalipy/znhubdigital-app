# app/web/routers/user_views.py
from fastapi import APIRouter, Request, Depends
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from app.Shared.dependencies import protected_view, get_menu_context # Import helpers

templates = Jinja2Templates(directory="templates")

# --- FIX 1: Add Dependency to Protect All Routes ---
user_view = APIRouter(include_in_schema=False, dependencies=[Depends(protected_view)])

# app/web/routers/user_views.py

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

@user_view.get("/dashboard")
async def dashboard_view(request: Request):
    context = get_template_context(request)
    return templates.TemplateResponse("dashboard.html", context) 

@user_view.get("/admin_users")
async def users_list_view(request: Request):
    context = get_template_context(request)
    return templates.TemplateResponse("admin_users.html", context)

@user_view.get("/manager_users")
async def manager_users_list_view(request: Request):
    context = get_template_context(request)
    return templates.TemplateResponse("manager_users.html", context)

@user_view.get("/profile")
async def profile_view(request: Request):
    context = get_template_context(request)
    return templates.TemplateResponse("profile.html", context)

@user_view.get("/settings", response_class=HTMLResponse)
async def settings_view(request: Request):
    context = get_template_context(request)
    return templates.TemplateResponse("settings.html", context)

@user_view.get("/about")
async def about_view(request: Request):
    context = get_template_context(request)
    return templates.TemplateResponse("about.html", context)

@user_view.get("/model_invoices")
async def model_invoice_view(request: Request):
    context = get_template_context(request)
    return templates.TemplateResponse("model_invoice/model_invoice.html", context)

@user_view.get("/model_invoices/report")
async def model_invoice_report_view(request: Request):
    context = get_template_context(request)
    return templates.TemplateResponse("model_invoice/model_invoice_report.html", context)

@user_view.get("/notifications")
async def view_notifications_page(request: Request):
    context= get_template_context(request)
    return templates.TemplateResponse("notifications.html", context)