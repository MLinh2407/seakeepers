import uuid
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation

from flask import Blueprint, jsonify, request, session

from config import PHOTOS_BUCKET, REPORTS_TABLE
from utils.aws_clients import dynamodb, s3

reports_bp = Blueprint("reports", __name__)
reports_table = dynamodb.Table(REPORTS_TABLE)


@reports_bp.route("/api/reports", methods=["POST"])
def create_report():
    if "user_id" not in session:
        return jsonify({"error": "login required"}), 401

    lat_raw = request.form.get("lat")
    lon_raw = request.form.get("lon")
    category = request.form.get("category")
    severity = request.form.get("severity")
    photo = request.files.get("photo")

    if not lat_raw or not lon_raw or not category or not severity:
        return jsonify({"error": "lat, lon, category, and severity are required"}), 400

    try:
        lat = Decimal(lat_raw)
        lon = Decimal(lon_raw)
    except InvalidOperation:
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

    item = {
        "report_id": report_id,
        "lat": lat,
        "lon": lon,
        "category": category,
        "severity": severity,
        "photo_url": photo_url,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "user_id": session["user_id"],
    }
    reports_table.put_item(Item=item)

    return jsonify({"message": "report created", "report_id": report_id}), 201


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
    # Decimal isn't JSON-serializable by default — convert for the response
    for item in items:
        if "lat" in item:
            item["lat"] = float(item["lat"])
        if "lon" in item:
            item["lon"] = float(item["lon"])

    return jsonify(items), 200
