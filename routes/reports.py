import uuid
from datetime import datetime, timezone
from decimal import Decimal

from botocore.exceptions import BotoCoreError, ClientError
from flask import Blueprint, jsonify, request, session

from config import REPORTS_TABLE
from utils.aws_clients import dynamodb
from utils.photo_upload import upload_photo
from utils.weather import get_weather_snapshot

reports_bp = Blueprint("reports", __name__)
reports_table = dynamodb.Table(REPORTS_TABLE)

ALLOWED_CATEGORIES = {"plastic", "glass", "metal", "rubber", "fabric", "other"}
ALLOWED_SEVERITIES = {"low", "medium", "high"}


@reports_bp.route("/api/reports", methods=["POST"])
def create_report():
    if "user_id" not in session:
        return jsonify({"error": "login required"}), 401

    category = request.form.get("category")
    severity = request.form.get("severity")
    lat_raw = request.form.get("lat")
    lon_raw = request.form.get("lon")
    site_name = request.form.get("site_name", "").strip() or None
    photo = request.files.get("photo")

    if not category or not severity:
        return jsonify({"error": "category and severity are required"}), 400
    if category not in ALLOWED_CATEGORIES:
        return jsonify(
            {
                "error": f"category must be one of: {', '.join(sorted(ALLOWED_CATEGORIES))}"
            }
        ), 400
    if severity not in ALLOWED_SEVERITIES:
        return jsonify(
            {
                "error": f"severity must be one of: {', '.join(sorted(ALLOWED_SEVERITIES))}"
            }
        ), 400

    if not lat_raw or not lon_raw:
        return jsonify(
            {
                "error": "a location is required -- search an address, use your current location, or click the map"
            }
        ), 400

    try:
        lat = float(lat_raw)
        lon = float(lon_raw)
    except ValueError:
        return jsonify({"error": "lat/lon must be valid numbers"}), 400

    if not (-90 <= lat <= 90) or not (-180 <= lon <= 180):
        return jsonify({"error": "lat/lon are out of valid range"}), 400

    report_id = "user_" + str(uuid.uuid4())

    photo_url, photo_error, is_validation_error = upload_photo(photo, report_id)
    if is_validation_error:
        return jsonify({"error": photo_error}), 400

    weather_snapshot = get_weather_snapshot(lat, lon)

    item = {
        "report_id": report_id,
        "lat": Decimal(str(lat)),
        "lon": Decimal(str(lon)),
        "category": category,
        "severity": severity,
        "site_name": site_name,
        "photo_url": photo_url,
        "weather_snapshot": weather_snapshot,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "user_id": session["user_id"],
    }
    item = {k: v for k, v in item.items() if v is not None}

    try:
        reports_table.put_item(Item=item)
    except (ClientError, BotoCoreError) as e:
        return jsonify(
            {
                "error": "Couldn't save your report right now -- please try again shortly."
            }
        ), 503

    response = {
        "message": "report created",
        "report_id": report_id,
        "lat": lat,
        "lon": lon,
        "site_name": site_name,
        "weather_snapshot": weather_snapshot,
    }
    if photo_error:
        response["warning"] = photo_error

    return jsonify(response), 201


@reports_bp.route("/api/reports", methods=["GET"])
def get_reports():
    category = request.args.get("category")

    try:
        if category:
            # Query category-timestamp-index GSI
            result = reports_table.query(
                IndexName="category-timestamp-index",
                KeyConditionExpression="category = :c",
                ExpressionAttributeValues={":c": category},
            )
        else:
            result = reports_table.scan()
    except (ClientError, BotoCoreError):
        return jsonify(
            {"error": "Couldn't load reports right now -- please try again shortly."}
        ), 503

    items = result.get("Items", [])

    for item in items:
        for key, value in item.items():
            if isinstance(value, Decimal):
                item[key] = int(value) if value % 1 == 0 else float(value)

    return jsonify(items), 200
