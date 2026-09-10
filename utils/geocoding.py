import requests

from config import NOMINATIM_USER_AGENT

NOMINATIM_SEARCH_URL = "https://nominatim.openstreetmap.org/search"
NOMINATIM_REVERSE_URL = "https://nominatim.openstreetmap.org/reverse"

_HEADERS = {"User-Agent": NOMINATIM_USER_AGENT}


def search_suggestions(query, limit=5):
    """Returns place suggestions with names and coordinates for address autocomplete."""
    params = {"q": query, "format": "json", "limit": limit}
    try:
        resp = requests.get(
            NOMINATIM_SEARCH_URL, headers=_HEADERS, params=params, timeout=10
        )
        resp.raise_for_status()
        results = resp.json()
    except (requests.RequestException, ValueError):
        # Return empty list on network error or invalid JSON response
        return []

    suggestions = []
    for r in results:
        try:
            suggestions.append(
                {
                    "display_name": r["display_name"],
                    "lat": float(r["lat"]),
                    "lon": float(r["lon"]),
                }
            )
        except (KeyError, TypeError, ValueError):
            # Skip malformed items
            continue

    return suggestions


def reverse_geocode(lat, lon):
    """Converts coordinates to a place name, returning None if unresolvable."""
    params = {"lat": lat, "lon": lon, "format": "json"}
    try:
        resp = requests.get(
            NOMINATIM_REVERSE_URL, headers=_HEADERS, params=params, timeout=10
        )
        resp.raise_for_status()
        data = resp.json()
    except (requests.RequestException, ValueError):
        return None

    return data.get("display_name")
