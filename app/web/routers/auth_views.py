from fastapi import APIRouter, Request
from fastapi.templating import Jinja2Templates

# Point to the root templates folder
templates = Jinja2Templates(directory="templates")

# include_in_schema=False hides these HTML pages from the API Swagger Docs
auth_view = APIRouter(include_in_schema=False)

@auth_view.get("/")
async def root_view(request: Request):
    """
    Root Route:
    If user is not logged in -> Renders Login.
    If user IS logged in -> Main.js will detect token and redirect to /dashboard.
    """
    return templates.TemplateResponse("auth/login.html", {"request": request})

@auth_view.get("/login")
async def login_view(request: Request):
    """
    Renders the Login Page.
    File location: templates/auth/login.html
    """
    return templates.TemplateResponse("auth/login.html", {"request": request})

@auth_view.get("/forgot-password")
async def forgot_password_view(request: Request):
    """
    Renders the Forgot Password Page.
    File location: templates/auth/forgot-password.html
    """
    return templates.TemplateResponse("auth/forgot-password.html", {"request": request})

@auth_view.get("/reset-password")
async def reset_password_view(request: Request):
    """
    Renders the Reset Password Page.
    File location: templates/auth/reset-password.html
    """
    return templates.TemplateResponse("auth/reset-password.html", {"request": request})