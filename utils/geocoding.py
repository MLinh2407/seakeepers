import requests

from config import NOMINATIM_USER_AGENT

NOMINATIM_SEARCH_URL = "https://nominatim.openstreetmap.org/search"
NOMINATIM_REVERSE_URL = "https://nominatim.openstreetmap.org/reverse"

_HEADERS = {"User-Agent": NOMINATIM_USER_AGENT}


def search_suggestions(query, limit=5):
    """
    Return up to `limit` real place suggestions for a partial query, each as
    {"display_name": str, "lat": float, "lon": float}.

    This backs the address autocomplete dropdown -- the frontend only ever
    lets a user submit a location by picking one of these, never by typing
    free text, which is what stops garbage/non-existent addresses (Nominatim's
    search is fuzzy and will loosely match almost anything, so "no results"
    isn't a reliable validity check on its own).
    """
    params = {"q": query, "format": "json", "limit": limit}
    try:
        resp = requests.get(
            NOMINATIM_SEARCH_URL, headers=_HEADERS, params=params, timeout=10
        )
        resp.raise_for_status()
        results = resp.json()
    except requests.RequestException:
        return []

    return [
        {
            "display_name": r["display_name"],
            "lat": float(r["lat"]),
            "lon": float(r["lon"]),
        }
        for r in results
    ]


def reverse_geocode(lat, lon):
    """
    Convert coordinates into a human-readable place name. Used to label a
    map-click pin or a "use my current location" pin. Returns None if it
    can't resolve (e.g. open ocean, far from any named place).
    """
    params = {"lat": lat, "lon": lon, "format": "json"}
    try:
        resp = requests.get(
            NOMINATIM_REVERSE_URL, headers=_HEADERS, params=params, timeout=10
        )
        resp.raise_for_status()
        data = resp.json()
    except requests.RequestException:
        return None

    return data.get("display_name")
