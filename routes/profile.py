from concurrent.futures import ThreadPoolExecutor
from decimal import Decimal

from flask import Blueprint, jsonify, render_template, session

from config import CAMPAIGNS_TABLE, REPORTS_TABLE, RSVPS_TABLE
from utils.aws_clients import dynamodb
from utils.rsvp_helpers import rsvp_info

profile_bp = Blueprint("profile", __name__)
reports_table = dynamodb.Table(REPORTS_TABLE)
campaigns_table = dynamodb.Table(CAMPAIGNS_TABLE)
rsvps_table = dynamodb.Table(RSVPS_TABLE)


def _clean_item(item):
    for key, value in item.items():
        if isinstance(value, Decimal):
            item[key] = int(value) if value % 1 == 0 else float(value)
    return item


def _query_all(table, index_name, key_name, key_value):
    """Paginated Query against a GSI -- reads only matching items, unlike a
    Scan which reads (and bills for) the whole table every time regardless
    of match count. Cost and speed here scale with the user's own data,
    not total table size."""
    items = []
    kwargs = {
        "IndexName": index_name,
        "KeyConditionExpression": f"{key_name} = :v",
        "ExpressionAttributeValues": {":v": key_value},
    }
    response = table.query(**kwargs)
    items.extend(response.get("Items", []))
    while "LastEvaluatedKey" in response:
        response = table.query(**kwargs, ExclusiveStartKey=response["LastEvaluatedKey"])
        items.extend(response.get("Items", []))
    return items


@profile_bp.route("/profile", methods=["GET"])
def profile_page():
    return render_template("profile.html")


@profile_bp.route("/api/profile", methods=["GET"])
def get_profile():
    if "user_id" not in session:
        return jsonify({"error": "login required"}), 401

    user_id = session["user_id"]

    # Each of these is now a targeted Query against a GSI, not a full table
    # scan -- reads only this user's rows, so cost/speed no longer grows
    # with total table size as the app scales.
    with ThreadPoolExecutor(max_workers=3) as executor:
        reports_future = executor.submit(
            _query_all, reports_table, "user_id-timestamp-index", "user_id", user_id
        )
        campaigns_future = executor.submit(
            _query_all, campaigns_table, "organizer-index", "organizer", user_id
        )
        rsvps_future = executor.submit(
            _query_all, rsvps_table, "user_id-index", "user_id", user_id
        )

        my_reports = [_clean_item(dict(r)) for r in reports_future.result()]
        my_campaigns = [_clean_item(dict(c)) for c in campaigns_future.result()]
        my_rsvps = rsvps_future.result()

    my_reports.sort(key=lambda r: r.get("timestamp", ""), reverse=True)
    my_campaigns.sort(key=lambda c: c.get("created_at", ""), reverse=True)
    for c in my_campaigns:
        c.update(rsvp_info(c["campaign_id"], user_id))

    # Still need the actual campaign details for each RSVP'd campaign_id --
    # these are individual get_item calls (fast, key-based lookups), not scans
    rsvped_campaigns = []
    for r in my_rsvps:
        result = campaigns_table.get_item(Key={"campaign_id": r["campaign_id"]})
        if "Item" in result:
            rsvped_campaigns.append(_clean_item(dict(result["Item"])))
    rsvped_campaigns.sort(key=lambda c: c.get("date", ""))
    for c in rsvped_campaigns:
        c.update(rsvp_info(c["campaign_id"], user_id))

    return jsonify(
        {
            "username": session.get("username", ""),
            "my_reports": my_reports,
            "my_campaigns": my_campaigns,
            "rsvped_campaigns": rsvped_campaigns,
        }
    ), 200
