from botocore.exceptions import BotoCoreError, ClientError

from config import PHOTOS_BUCKET
from utils.aws_clients import s3

ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/gif", "image/webp"}


def upload_photo(photo, key_prefix):
    """Validates and uploads a photo to S3, returning (photo_url, error_msg, is_validation_error)."""
    if not photo or not photo.filename:
        return None, None, False

    content_type = photo.content_type or ""
    if content_type not in ALLOWED_IMAGE_TYPES:
        return (
            None,
            f"Photo must be JPEG, PNG, GIF, or WebP (got {content_type or 'unknown type'})",
            True,
        )

    key = f"{key_prefix}/{photo.filename}"
    try:
        s3.upload_fileobj(
            photo,
            PHOTOS_BUCKET,
            key,
            ExtraArgs={"ContentType": content_type},
        )
        return f"https://{PHOTOS_BUCKET}.s3.amazonaws.com/{key}", None, False
    except (ClientError, BotoCoreError):
        return (
            None,
            "Photo upload failed, but the rest of your submission was saved.",
            False,
        )
