from flask import Blueprint, jsonify, request

from utils.geocoding import reverse_geocode, search_suggestions

geocode_bp = Blueprint("geocode", __name__)


@geocode_bp.route("/api/geocode/suggest", methods=["GET"])
def suggest():
    query = request.args.get("q", "").strip()
    if len(query) < 3:
        # avoid firing Nominatim requests on every single keystroke
        return jsonify([])

    return jsonify(search_suggestions(query))


@geocode_bp.route("/api/geocode/reverse", methods=["GET"])
def reverse():
    lat_raw = request.args.get("lat")
    lon_raw = request.args.get("lon")

    if not lat_raw or not lon_raw:
        return jsonify({"error": "lat and lon are required"}), 400

    try:
        lat = float(lat_raw)
        lon = float(lon_raw)
    except ValueError:
        return jsonify({"error": "lat/lon must be valid numbers"}), 400

    display_name = reverse_geocode(lat, lon)
    return jsonify({"display_name": display_name})
