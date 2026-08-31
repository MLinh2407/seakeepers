from flask import Blueprint, jsonify, session

from config import NOTIFICATIONS_TABLE
from utils.aws_clients import dynamodb

notifications_bp = Blueprint("notifications", __name__)
notifications_table = dynamodb.Table(NOTIFICATIONS_TABLE)


def _my_notifications():
    """Notifications table: partition key user_id, sort key notification_id
    -- this is a Query (fast), not a scan."""
    result = notifications_table.query(
        KeyConditionExpression="user_id = :uid",
        ExpressionAttributeValues={":uid": session["user_id"]},
    )
    items = result.get("Items", [])
    items.sort(key=lambda i: i.get("created_at", ""), reverse=True)
    return items


@notifications_bp.route("/api/notifications", methods=["GET"])
def get_notifications():
    if "user_id" not in session:
        return jsonify({"error": "login required"}), 401
    return jsonify(_my_notifications()), 200


@notifications_bp.route("/api/notifications/unread-count", methods=["GET"])
def unread_count():
    if "user_id" not in session:
        return jsonify({"count": 0}), 200
    count = sum(1 for n in _my_notifications() if not n.get("read"))
    return jsonify({"count": count}), 200


@notifications_bp.route("/api/notifications/<notification_id>/read", methods=["POST"])
def mark_read(notification_id):
    if "user_id" not in session:
        return jsonify({"error": "login required"}), 401

    notifications_table.update_item(
        Key={"user_id": session["user_id"], "notification_id": notification_id},
        UpdateExpression="SET #r = :true",
        ExpressionAttributeNames={"#r": "read"},
        ExpressionAttributeValues={":true": True},
    )
    return jsonify({"message": "marked read"}), 200


@notifications_bp.route("/api/notifications/read-all", methods=["POST"])
def mark_all_read():
    if "user_id" not in session:
        return jsonify({"error": "login required"}), 401

    for n in _my_notifications():
        if not n.get("read"):
            notifications_table.update_item(
                Key={"user_id": session["user_id"], "notification_id": n["notification_id"]},
                UpdateExpression="SET #r = :true",
                ExpressionAttributeNames={"#r": "read"},
                ExpressionAttributeValues={":true": True},
            )
    return jsonify({"message": "all marked read"}), 200