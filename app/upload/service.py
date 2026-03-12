# app/upload/service.py
import boto3
import os
import uuid
from botocore.config import Config
from botocore.exceptions import ClientError
from fastapi import UploadFile, HTTPException

# --- Configuration ---
ACCOUNT_ID = os.getenv("R2_ACCOUNT_ID")
ACCESS_KEY = os.getenv("R2_ACCESS_KEY_ID")
SECRET_KEY = os.getenv("R2_SECRET_ACCESS_KEY")
BUCKET_NAME = os.getenv("R2_BUCKET_NAME")
PUBLIC_DOMAIN = os.getenv("R2_PUBLIC_DOMAIN")

# --- Initialize R2 Client (S3 Compatible) ---
# We use signature_version='s3v4' which is required for Presigned URLs
s3_client = boto3.client(
    service_name='s3',
    endpoint_url=f"https://{ACCOUNT_ID}.r2.cloudflarestorage.com",
    aws_access_key_id=ACCESS_KEY,
    aws_secret_access_key=SECRET_KEY,
    config=Config(signature_version='s3v4'),
    region_name="auto"
)

def _get_unique_filename(filename: str, folder: str) -> str:
    """Generates a safe, unique path: folder/uuid.ext"""
    ext = filename.split(".")[-1].lower() if "." in filename else "bin"
    return f"{folder}/{uuid.uuid4()}.{ext}"

# --- 1. Server-Side Upload (For Small Files) ---
async def upload_file_stream(file: UploadFile, folder: str) -> str:
    """
    Uploads a file stream directly to R2.
    Best for: Profile Pics, Thumbnails, Small PDFs (< 10MB).
    """
    try:
        object_name = _get_unique_filename(file.filename, folder)
        
        s3_client.upload_fileobj(
            file.file,
            BUCKET_NAME,
            object_name,
            ExtraArgs={
                'ContentType': file.content_type,
                # 'ACL': 'public-read' # Uncomment if your bucket isn't public by default
            }
        )
        
        # Return the public URL
        return f"{PUBLIC_DOMAIN}/{object_name}" if PUBLIC_DOMAIN else object_name

    except ClientError as e:
        print(f"R2 Client Error: {e}")
        raise HTTPException(status_code=500, detail="Storage service error")
    except Exception as e:
        print(f"Upload Error: {e}")
        raise HTTPException(status_code=500, detail="Failed to upload file")

# --- 2. Presigned URL (For Large Files) ---
def generate_presigned_url(filename: str, content_type: str, folder: str) -> dict:
    """
    Generates a secure URL for the frontend to upload directly to R2.
    Best for: Videos, Large Archives, 4K Images.
    """
    try:
        object_name = _get_unique_filename(filename, folder)

        # Generate the URL (Expires in 1 hour)
        presigned_url = s3_client.generate_presigned_url(
            'put_object',
            Params={
                'Bucket': BUCKET_NAME,
                'Key': object_name,
                'ContentType': content_type,
            },
            ExpiresIn=3600
        )
        
        return {
            "upload_url": presigned_url,       # PUT here
            "public_url": f"{PUBLIC_DOMAIN}/{object_name}", # Save this to DB
            "file_key": object_name            # For deletion later
        }

    except ClientError as e:
        print(f"R2 Presign Error: {e}")
        raise HTTPException(status_code=500, detail="Could not generate upload ticket")