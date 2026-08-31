"""
이미지 저장 서비스.
USE_LOCAL_STORAGE=true 면 로컬 디스크에 저장하고 정적 URL 반환.
false 면 S3 사용 (운영 환경).
"""
import os
import uuid
from pathlib import Path
from app.config import get_settings

settings = get_settings()

if not settings.USE_LOCAL_STORAGE:
    import boto3
    from botocore.exceptions import ClientError
    s3 = boto3.client(
        "s3",
        aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
        aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
        region_name=settings.AWS_REGION,
    )
    BUCKET = settings.S3_BUCKET_NAME
else:
    Path(settings.LOCAL_STORAGE_DIR).mkdir(parents=True, exist_ok=True)


def upload_image(file_bytes: bytes, prefix: str = "scans", content_type: str = "image/jpeg") -> str:
    key = f"{prefix}/{uuid.uuid4()}.jpg"

    if settings.USE_LOCAL_STORAGE:
        path = Path(settings.LOCAL_STORAGE_DIR) / key
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(file_bytes)
        return key

    s3.put_object(
        Bucket=BUCKET,
        Key=key,
        Body=file_bytes,
        ContentType=content_type,
    )
    return key


def get_presigned_url(key: str, expires: int = 3600) -> str:
    if settings.USE_LOCAL_STORAGE:
        return f"{settings.LOCAL_STORAGE_BASE_URL}/{key}"

    try:
        return s3.generate_presigned_url(
            "get_object",
            Params={"Bucket": BUCKET, "Key": key},
            ExpiresIn=expires,
        )
    except ClientError:
        return ""


def delete_object(key: str) -> None:
    if settings.USE_LOCAL_STORAGE:
        path = Path(settings.LOCAL_STORAGE_DIR) / key
        if path.exists():
            path.unlink()
        return

    try:
        s3.delete_object(Bucket=BUCKET, Key=key)
    except ClientError:
        pass
