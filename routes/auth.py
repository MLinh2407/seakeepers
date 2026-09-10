import uuid
from datetime import datetime, timezone

from flask import Blueprint, jsonify, request, session
from werkzeug.security import check_password_hash, generate_password_hash

from config import USERS_TABLE
from utils.aws_clients import dynamodb

auth_bp = Blueprint("auth", __name__)
users_table = dynamodb.Table(USERS_TABLE)

MIN_PASSWORD_LENGTH = 8


@auth_bp.route("/api/register", methods=["POST"])
def register():
    data = request.get_json(silent=True) or {}
    email = data.get("email", "").strip().lower()
    username = data.get("username", "").strip()
    password = data.get("password", "")

    if not email or not username or not password:
        return jsonify({"error": "email, username, and password are required"}), 400
    if len(password) < MIN_PASSWORD_LENGTH:
        return jsonify(
            {"error": f"password must be at least {MIN_PASSWORD_LENGTH} characters"}
        ), 400

    existing = users_table.scan(
        FilterExpression="email = :e",
        ExpressionAttributeValues={":e": email},
    )
    if existing.get("Items"):
        return jsonify({"error": "an account with this email already exists"}), 409

    user_id = str(uuid.uuid4())
    users_table.put_item(
        Item={
            "user_id": user_id,
            "email": email,
            "username": username,
            "password_hash": generate_password_hash(password),
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
    )

    return jsonify({"message": "registered", "user_id": user_id}), 201


@auth_bp.route("/api/login", methods=["POST"])
def login():
    data = request.get_json(silent=True) or {}
    email = data.get("email", "").strip().lower()
    password = data.get("password", "")

    result = users_table.scan(
        FilterExpression="email = :e",
        ExpressionAttributeValues={":e": email},
    )
    items = result.get("Items", [])
    if not items:
        return jsonify({"error": "invalid credentials"}), 401

    user = items[0]
    if not check_password_hash(user["password_hash"], password):
        return jsonify({"error": "invalid credentials"}), 401

    session.permanent = True
    session["user_id"] = user["user_id"]
    session["username"] = user["username"]

    return jsonify({"message": "logged in", "username": user["username"]}), 200


@auth_bp.route("/api/logout", methods=["POST"])
def logout():
    session.clear()
    return jsonify({"message": "logged out"}), 200


@auth_bp.route("/api/session", methods=["GET"])
def check_session():
    """Returns the current authentication status from the Flask session"""
    if "user_id" in session:
        return jsonify({"logged_in": True, "username": session.get("username")}), 200
    return jsonify({"logged_in": False}), 200
