"""S3 helpers for optional service-ticket image uploads.

Credentials use boto3's default provider chain. On EC2, prefer an IAM role;
for local development, use standard AWS CLI/environment credentials. See
`docs/S3_SETUP.md` for bucket-access guidance.
"""
import io
import uuid
from datetime import datetime

import boto3
from botocore.exceptions import BotoCoreError, ClientError
from flask import current_app

ALLOWED_CONTENT_TYPES = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/heic": "heic",
    "image/heif": "heif",
}


class UploadError(Exception):
    """Raised for any problem that should be shown to the user as-is —
    missing config, bad file type, file too large, or an S3-side failure."""
    pass


def _client():
    region = current_app.config["S3_REGION"]
    return boto3.client("s3", region_name=region)


def upload_ticket_image(file_storage, kind):
    """
    file_storage: werkzeug FileStorage (request.files['image'])
    kind: 'before' or 'after' — only used to make the filename readable in
          the bucket, not for any logic here.
    Returns the public HTTPS URL of the uploaded object.
    """
    bucket = current_app.config["S3_BUCKET"]
    if not bucket:
        raise UploadError(
            "Image storage isn't configured yet — set S3_BUCKET and S3_REGION "
            "in .env once the bucket is ready."
        )

    content_type = (file_storage.mimetype or "").lower()
    ext = ALLOWED_CONTENT_TYPES.get(content_type)
    if not ext:
        raise UploadError(
            "Please attach a photo (JPEG, PNG, WEBP, or HEIC) — that file type isn't supported."
        )

    max_bytes = current_app.config["S3_MAX_UPLOAD_MB"] * 1024 * 1024
    data = file_storage.read()
    if len(data) > max_bytes:
        raise UploadError(f"That photo is too large — please keep it under {current_app.config['S3_MAX_UPLOAD_MB']}MB.")
    if len(data) == 0:
        raise UploadError("That file appears to be empty.")

    today = datetime.utcnow()
    key = f"calls/{today:%Y/%m}/{kind}-{uuid.uuid4().hex[:12]}.{ext}"

    try:
        _client().upload_fileobj(
            io.BytesIO(data), bucket, key,
            ExtraArgs={"ContentType": content_type},
        )
    except (BotoCoreError, ClientError) as e:
        current_app.logger.exception("S3 upload failed")
        raise UploadError("Couldn't upload that photo right now — please try again.") from e

    region = current_app.config["S3_REGION"]
    return f"https://{bucket}.s3.{region}.amazonaws.com/{key}"
