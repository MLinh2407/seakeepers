import uuid
from datetime import datetime, timezone
from decimal import Decimal

from botocore.exceptions import BotoCoreError, ClientError
from flask import Blueprint, jsonify, render_template, request, session

from config import CAMPAIGNS_TABLE, RSVPS_TABLE
from utils.aws_clients import dynamodb
from utils.notifications import create_notification
from utils.photo_upload import upload_photo
from utils.rsvp_helpers import rsvp_info

campaigns_bp = Blueprint("campaigns", __name__)
campaigns_table = dynamodb.Table(CAMPAIGNS_TABLE)
rsvps_table = dynamodb.Table(RSVPS_TABLE)

MAX_DESCRIPTION_LEN = 2000


def _clean_item(item):
    """Convert any DynamoDB Decimal fields to plain int/float for JSON"""
    for key, value in item.items():
        if isinstance(value, Decimal):
            item[key] = int(value) if value % 1 == 0 else float(value)
    return item


@campaigns_bp.route("/api/campaigns", methods=["POST"])
def create_campaign():
    if "user_id" not in session:
        return jsonify({"error": "login required"}), 401

    location_name = (request.form.get("location_name") or "").strip()
    lat = request.form.get("lat")
    lon = request.form.get("lon")
    date = request.form.get("date")
    description = (request.form.get("description") or "").strip()
    photo = request.files.get("photo")

    if not location_name or lat is None or lon is None:
        return jsonify(
            {"error": "search for a location and pick a suggestion first"}
        ), 400
    if not date or not description:
        return jsonify({"error": "date and description are required"}), 400
    if len(description) > MAX_DESCRIPTION_LEN:
        return jsonify(
            {"error": f"description must be under {MAX_DESCRIPTION_LEN} characters"}
        ), 400

    try:
        parsed_date = datetime.strptime(date, "%Y-%m-%d").date()
    except ValueError:
        return jsonify({"error": "date must be in YYYY-MM-DD format"}), 400
    if parsed_date < datetime.now(timezone.utc).date():
        return jsonify({"error": "campaign date can't be in the past"}), 400

    try:
        lat = float(lat)
        lon = float(lon)
    except (TypeError, ValueError):
        return jsonify({"error": "lat/lon must be valid numbers"}), 400
    if not (-90 <= lat <= 90) or not (-180 <= lon <= 180):
        return jsonify({"error": "lat/lon are out of valid range"}), 400

    campaign_id = str(uuid.uuid4())

    photo_url, photo_error, is_validation_error = upload_photo(
        photo, f"campaigns/{campaign_id}"
    )
    if is_validation_error:
        return jsonify({"error": photo_error}), 400

    item = {
        "campaign_id": campaign_id,
        "location_name": location_name,
        "lat": Decimal(str(lat)),
        "lon": Decimal(str(lon)),
        "date": date,
        "description": description,
        "photo_url": photo_url,
        "organizer": session["user_id"],
        "organizer_username": session.get("username", ""),
        "status": "upcoming",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    item = {k: v for k, v in item.items() if v is not None}

    try:
        campaigns_table.put_item(Item=item)
    except (ClientError, BotoCoreError):
        return jsonify(
            {
                "error": "Couldn't save your campaign right now -- please try again shortly."
            }
        ), 503

    response = {"message": "campaign created", "campaign_id": campaign_id}
    if photo_error:
        response["warning"] = photo_error

    return jsonify(response), 201


@campaigns_bp.route("/api/campaigns", methods=["GET"])
def get_campaigns():
    mine_only = request.args.get("mine") == "true"

    try:
        result = campaigns_table.scan()
    except (ClientError, BotoCoreError):
        return jsonify(
            {"error": "Couldn't load campaigns right now -- please try again shortly."}
        ), 503

    items = [_clean_item(dict(item)) for item in result.get("Items", [])]

    current_user_id = session.get("user_id")
    if mine_only:
        if not current_user_id:
            return jsonify({"error": "login required"}), 401
        items = [i for i in items if i.get("organizer") == current_user_id]

    for item in items:
        item.update(rsvp_info(item["campaign_id"], current_user_id))

    items.sort(key=lambda i: i.get("created_at", ""), reverse=True)

    return jsonify(items), 200


@campaigns_bp.route("/api/campaigns/<campaign_id>", methods=["GET"])
def get_campaign(campaign_id):
    try:
        result = campaigns_table.get_item(Key={"campaign_id": campaign_id})
    except (ClientError, BotoCoreError):
        return jsonify(
            {
                "error": "Couldn't load that campaign right now -- please try again shortly."
            }
        ), 503

    item = result.get("Item")
    if not item:
        return jsonify({"error": "campaign not found"}), 404

    item = _clean_item(dict(item))
    item.update(rsvp_info(campaign_id, session.get("user_id")))

    return jsonify(item), 200


@campaigns_bp.route("/api/campaigns/<campaign_id>/rsvp", methods=["POST"])
def rsvp_campaign(campaign_id):
    if "user_id" not in session:
        return jsonify({"error": "login required"}), 401

    try:
        existing = campaigns_table.get_item(Key={"campaign_id": campaign_id})
    except (ClientError, BotoCoreError):
        return jsonify(
            {
                "error": "Couldn't process your RSVP right now -- please try again shortly."
            }
        ), 503

    campaign = existing.get("Item")
    if not campaign:
        return jsonify({"error": "campaign not found"}), 404

    try:
        rsvps_table.put_item(
            Item={
                "campaign_id": campaign_id,
                "user_id": session["user_id"],
                "username": session.get("username", ""),
                "rsvp_at": datetime.now(timezone.utc).isoformat(),
            }
        )
    except (ClientError, BotoCoreError):
        return jsonify(
            {
                "error": "Couldn't process your RSVP right now -- please try again shortly."
            }
        ), 503

    # Notify organizer if another user RSVPs
    organizer_id = campaign.get("organizer")
    if organizer_id and organizer_id != session["user_id"]:
        location_name = campaign.get("location_name", "your cleanup")
        username = session.get("username", "Someone")
        create_notification(
            user_id=organizer_id,
            message=f"{username} RSVP'd to your cleanup at {location_name}",
            link=f"/campaigns/{campaign_id}",
        )

    return jsonify({"message": "RSVP recorded"}), 201


@campaigns_bp.route("/api/campaigns/<campaign_id>/rsvp", methods=["DELETE"])
def cancel_rsvp(campaign_id):
    if "user_id" not in session:
        return jsonify({"error": "login required"}), 401

    try:
        rsvps_table.delete_item(
            Key={"campaign_id": campaign_id, "user_id": session["user_id"]}
        )
    except (ClientError, BotoCoreError):
        return jsonify(
            {
                "error": "Couldn't cancel your RSVP right now -- please try again shortly."
            }
        ), 503

    return jsonify({"message": "RSVP cancelled"}), 200


# --- Page routes ---


@campaigns_bp.route("/campaigns", methods=["GET"])
def campaigns_page():
    return render_template("campaigns.html")


@campaigns_bp.route("/campaigns/<campaign_id>", methods=["GET"])
def campaign_detail_page(campaign_id):
    try:
        result = campaigns_table.get_item(Key={"campaign_id": campaign_id})
    except (ClientError, BotoCoreError):
        return "Couldn't load this campaign right now -- please try again shortly.", 503

    item = result.get("Item")
    if not item:
        return "Campaign not found", 404

    item = _clean_item(dict(item))
    campaign_url = request.url

    return render_template(
        "campaign_detail.html", campaign=item, campaign_url=campaign_url
    )
