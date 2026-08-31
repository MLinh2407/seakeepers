import uuid
from datetime import datetime, timezone

from config import NOTIFICATIONS_TABLE
from utils.aws_clients import dynamodb

notifications_table = dynamodb.Table(NOTIFICATIONS_TABLE)


def create_notification(user_id, message, link=None):
    """Write a notification for `user_id`. Never raises -- a notification
    failing to write should never break the action that triggered it
    (e.g. an RSVP should still succeed even if this fails)."""
    try:
        notifications_table.put_item(
            Item={
                "user_id": user_id,
                "notification_id": str(uuid.uuid4()),
                "message": message,
                "link": link or "",
                "read": False,
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
        )
    except Exception:
        pass
