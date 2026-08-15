import uuid
from datetime import datetime, timezone
from decimal import Decimal

from flask import Blueprint, jsonify, request, session

from config import PHOTOS_BUCKET, REPORTS_TABLE
from utils.aws_clients import dynamodb, s3
from utils.weather import get_weather_snapshot

reports_bp = Blueprint("reports", __name__)
reports_table = dynamodb.Table(REPORTS_TABLE)


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

    # lat/lon must already be resolved by the frontend -- via a picked
    # autocomplete suggestion, "use my location", or a map click. Free-text
    # addresses are no longer geocoded server-side on submit; resolution
    # happens up front through /api/geocode/* so a garbage/non-existent
    # location can never reach this point in the first place.
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

    report_id = "user_" + str(uuid.uuid4())
    photo_url = None

    if photo and photo.filename:
        key = f"{report_id}/{photo.filename}"
        s3.upload_fileobj(
            photo,
            PHOTOS_BUCKET,
            key,
            ExtraArgs={"ContentType": photo.content_type or "application/octet-stream"},
        )
        photo_url = f"https://{PHOTOS_BUCKET}.s3.amazonaws.com/{key}"

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
    # Drop any None values -- cleaner than storing explicit DynamoDB NULLs
    item = {k: v for k, v in item.items() if v is not None}

    reports_table.put_item(Item=item)

    return jsonify(
        {
            "message": "report created",
            "report_id": report_id,
            "lat": lat,
            "lon": lon,
            "site_name": site_name,
            "weather_snapshot": weather_snapshot,
        }
    ), 201


@reports_bp.route("/api/reports", methods=["GET"])
def get_reports():
    category = request.args.get("category")

    if category:
        # uses the GSI created in Phase 1 (category-timestamp-index)
        result = reports_table.query(
            IndexName="category-timestamp-index",
            KeyConditionExpression="category = :c",
            ExpressionAttributeValues={":c": category},
        )
    else:
        result = reports_table.scan()

    items = result.get("Items", [])

    # DynamoDB returns numeric fields as Decimal, which jsonify can't
    # serialize. Convert every Decimal in every item generically -- the
    # seed data has fields like total_debris_items that aren't lat/lon.
    for item in items:
        for key, value in item.items():
            if isinstance(value, Decimal):
                item[key] = int(value) if value % 1 == 0 else float(value)

    return jsonify(items), 200
