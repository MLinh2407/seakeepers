from collections import Counter
from decimal import Decimal

from botocore.exceptions import BotoCoreError, ClientError
from flask import Blueprint, jsonify

from config import ATHENA_TABLE, REPORTS_TABLE
from utils.athena import run_athena_query
from utils.aws_clients import dynamodb
from utils.cache import cache_get, cache_set

analytics_bp = Blueprint("analytics", __name__)
reports_table = dynamodb.Table(REPORTS_TABLE)

CACHE_TTL_SECONDS = 300  # 5 minutes


def _scan_all_reports():
    """Paginated DynamoDB scan. Converts Decimals to int/float and returns [] on error to prevent endpoint crashes."""
    items = []
    try:
        response = reports_table.scan()
        items.extend(response.get("Items", []))
        while "LastEvaluatedKey" in response:
            response = reports_table.scan(
                ExclusiveStartKey=response["LastEvaluatedKey"]
            )
            items.extend(response.get("Items", []))
    except (ClientError, BotoCoreError):
        return []

    for item in items:
        for key, value in item.items():
            if isinstance(value, Decimal):
                item[key] = int(value) if value % 1 == 0 else float(value)
    return items


def _run_athena_safe(query):
    """Executes Athena query safely, returning ([], True) on error to allow DynamoDB fallback."""
    try:
        return run_athena_query(query), False
    except (RuntimeError, TimeoutError, ClientError, BotoCoreError):
        return [], True


@analytics_bp.route("/api/analytics/by-region", methods=["GET"])
def by_region():
    cache_key = "analytics:by-region"
    cached = cache_get(cache_key)
    if cached is not None:
        return jsonify({"data": cached, "cached": True, "partial": False}), 200

    # Group by site_name as a proxy for region
    query = f"""
        SELECT site_name, COUNT(*) AS report_count
        FROM {ATHENA_TABLE}
        WHERE site_name IS NOT NULL
        GROUP BY site_name
        ORDER BY report_count DESC
        LIMIT 20
    """
    athena_rows, athena_failed = _run_athena_safe(query)
    counts = Counter()
    for row in athena_rows:
        if row.get("site_name") and row.get("report_count"):
            counts[row["site_name"]] += int(row["report_count"])

    for item in _scan_all_reports():
        site = item.get("site_name")
        if site:
            counts[site] += 1

    data = [
        {"site_name": name, "count": count} for name, count in counts.most_common(20)
    ]

    # Only cache complete results to avoid persisting partial data on Athena errors
    if not athena_failed:
        cache_set(cache_key, data, CACHE_TTL_SECONDS)

    return jsonify({"data": data, "cached": False, "partial": athena_failed}), 200


@analytics_bp.route("/api/analytics/by-type", methods=["GET"])
def by_type():
    cache_key = "analytics:by-type"
    cached = cache_get(cache_key)
    if cached is not None:
        return jsonify({"data": cached, "cached": True, "partial": False}), 200

    query = f"""
        SELECT category, COUNT(*) AS report_count
        FROM {ATHENA_TABLE}
        WHERE category IS NOT NULL
        GROUP BY category
    """
    athena_rows, athena_failed = _run_athena_safe(query)
    counts = Counter()
    for row in athena_rows:
        if row.get("category") and row.get("report_count"):
            counts[row["category"]] += int(row["report_count"])

    for item in _scan_all_reports():
        category = item.get("category")
        if category:
            counts[category] += 1

    data = [
        {"category": category, "count": count} for category, count in counts.items()
    ]

    if not athena_failed:
        cache_set(cache_key, data, CACHE_TTL_SECONDS)

    return jsonify({"data": data, "cached": False, "partial": athena_failed}), 200


@analytics_bp.route("/api/analytics/trends", methods=["GET"])
def trends():
    cache_key = "analytics:trends"
    cached = cache_get(cache_key)
    if cached is not None:
        return jsonify({"data": cached, "cached": True, "partial": False}), 200

    query = f"""
        SELECT SUBSTR(timestamp, 1, 7) AS year_month, COUNT(*) AS report_count
        FROM {ATHENA_TABLE}
        WHERE timestamp IS NOT NULL
        GROUP BY SUBSTR(timestamp, 1, 7)
        ORDER BY year_month
    """
    athena_rows, athena_failed = _run_athena_safe(query)
    counts = Counter()
    for row in athena_rows:
        if row.get("year_month") and row.get("report_count"):
            counts[row["year_month"]] += int(row["report_count"])

    for item in _scan_all_reports():
        ts = item.get("timestamp")
        if ts and len(ts) >= 7:
            counts[ts[:7]] += 1

    data = [{"month": month, "count": count} for month, count in sorted(counts.items())]

    if not athena_failed:
        cache_set(cache_key, data, CACHE_TTL_SECONDS)

    return jsonify({"data": data, "cached": False, "partial": athena_failed}), 200
