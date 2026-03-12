# app/upload/upload.py
from fastapi import APIRouter, UploadFile, File, HTTPException, Depends, status, Body
from pydantic import BaseModel, Field
from typing import Optional
from app.user.user import get_current_user 
from app.user.models import User
import app.upload.service as _upload_service 

router = APIRouter()

# --- CONSTANTS ---
MAX_SMALL_FILE_SIZE = 10 * 1024 * 1024  # 10 MB

ALLOWED_IMAGES = {
    "image/jpeg": "jpg", "image/png": "png", 
    "image/webp": "webp", "image/jpg": "jpg"
}
ALLOWED_DOCS = {
    "application/pdf": "pdf", "application/msword": "doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "text/plain": "txt", "text/csv": "csv"
}
ALLOWED_VIDEOS = {
    "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm"
}

# --- Models ---
class PresignedUrlReq(BaseModel):
    filename: str = Field(..., min_length=1)
    content_type: str = Field(..., description="MIME type")
    category: str = Field("vault", description="'vault', 'reels', 'profiles'")

# --- Helper ---
def validate_file_type(content_type: str, allowed_map: dict):
    if content_type not in allowed_map:
        raise HTTPException(
            status_code=400, 
            detail=f"Invalid file type: {content_type}. Allowed: {list(allowed_map.keys())}"
        )

# =========================================================
# 1. NEW ENDPOINT: Presigned URL (For Videos/Large Files)
# =========================================================
@router.post("/presigned-url", status_code=status.HTTP_200_OK)
async def get_upload_ticket(
    req: PresignedUrlReq,
    current_user: User = Depends(get_current_user)
):
    """
    Get a secure ticket to upload Large Files (5GB+) directly to Cloudflare.
    """
    # 1. Global Type Check
    all_allowed = {**ALLOWED_IMAGES, **ALLOWED_DOCS, **ALLOWED_VIDEOS}
    validate_file_type(req.content_type, all_allowed)

    # 2. Map Category to Folder
    folder_map = {
        "profiles": "images/profiles",
        "reels": "videos/reels",
        "feed": "images/feed",
        "vault": "vault/general",
        "documents": "documents/legal"
    }
    target_folder = folder_map.get(req.category, "vault/misc")

    # 3. Generate Ticket
    data = _upload_service.generate_presigned_url(
        filename=req.filename, 
        content_type=req.content_type, 
        folder=target_folder
    )

    return {"status": "success", "ticket": data}

# =========================================================
# 2. NEW ENDPOINT: Server-Side Upload (Strict Control)
# =========================================================
@router.post("/small-file", status_code=status.HTTP_201_CREATED)
async def upload_small_file(
    file: UploadFile = File(...),
    type_group: str = "image",
    current_user: User = Depends(get_current_user) 
):
    # 1. Size Check
    file.file.seek(0, 2)
    size = file.file.tell()
    await file.seek(0)
    
    if size > MAX_SMALL_FILE_SIZE:
        raise HTTPException(status_code=413, detail="File too large. Use Presigned URL.")

    # 2. Type & Folder Check
    folder = "misc"
    if type_group == "image":
        validate_file_type(file.content_type, ALLOWED_IMAGES)
        folder = "images/general"
    elif type_group == "document":
        validate_file_type(file.content_type, ALLOWED_DOCS)
        folder = "documents/general"
    else:
        raise HTTPException(status_code=400, detail="Invalid type_group")

    # 3. Upload
    url = await _upload_service.upload_file_stream(file, folder=folder)
    
    return {
        "status": "success", 
        "url": url, 
        "filename": file.filename
    }

# =========================================================
# 3. LEGACY SUPPORT (Keeps your Settings Page working)
# =========================================================
@router.post("/general-upload", status_code=status.HTTP_201_CREATED, include_in_schema=False)
async def upload_general_legacy(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user) 
):
    """
    DEPRECATED: This exists so your current 'settings.js' doesn't break.
    It routes the old request to the new logic.
    """
    # Force type_group='image' because your settings page is for profile pics
    return await upload_small_file(file=file, type_group="image", current_user=current_user)