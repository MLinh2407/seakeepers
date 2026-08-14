import uuid
from datetime import datetime, timezone

from flask import Blueprint, jsonify, request, session

from config import CAMPAIGNS_TABLE, RSVPS_TABLE
from utils.aws_clients import dynamodb

campaigns_bp = Blueprint("campaigns", __name__)
campaigns_table = dynamodb.Table(CAMPAIGNS_TABLE)
rsvps_table = dynamodb.Table(RSVPS_TABLE)


@campaigns_bp.route("/api/campaigns", methods=["POST"])
def create_campaign():
    if "user_id" not in session:
        return jsonify({"error": "login required"}), 401

    data = request.get_json(silent=True) or {}
    location = data.get("location")
    date = data.get("date")
    description = data.get("description", "")

    if not location or not date:
        return jsonify({"error": "location and date are required"}), 400

    campaign_id = str(uuid.uuid4())
    campaigns_table.put_item(Item={
        "campaign_id": campaign_id,
        "location": location,
        "date": date,
        "description": description,
        "organizer": session["user_id"],
        "status": "upcoming",
        "created_at": datetime.now(timezone.utc).isoformat(),
    })

    return jsonify({"message": "campaign created", "campaign_id": campaign_id}), 201


@campaigns_bp.route("/api/campaigns", methods=["GET"])
def get_campaigns():
    result = campaigns_table.scan()
    return jsonify(result.get("Items", [])), 200


@campaigns_bp.route("/api/campaigns/<campaign_id>/rsvp", methods=["POST"])
def rsvp_campaign(campaign_id):
    if "user_id" not in session:
        return jsonify({"error": "login required"}), 401

    # put_item on the (campaign_id, user_id) composite key naturally enforces
    # "one RSVP per user per campaign" — a repeat RSVP just overwrites the timestamp
    rsvps_table.put_item(Item={
        "campaign_id": campaign_id,
        "user_id": session["user_id"],
        "rsvp_at": datetime.now(timezone.utc).isoformat(),
    })

    return jsonify({"message": "RSVP recorded"}), 201