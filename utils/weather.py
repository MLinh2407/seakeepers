import requests

from config import OPENWEATHERMAP_API_KEY

OWM_URL = "https://api.openweathermap.org/data/2.5/weather"


def get_weather_snapshot(lat, lon):
    """Fetches current weather conditions as a formatted string, returning None on failure or missing API key."""
    if not OPENWEATHERMAP_API_KEY:
        return None

    params = {
        "lat": lat,
        "lon": lon,
        "appid": OPENWEATHERMAP_API_KEY,
        "units": "metric",
    }

    try:
        resp = requests.get(OWM_URL, params=params, timeout=10)
        resp.raise_for_status()
        data = resp.json()
        condition = data["weather"][0]["main"]
        temp = data["main"]["temp"]
        wind = data["wind"]["speed"]
        return f"{condition}, {temp}\u00b0C, wind {wind} m/s"
    except (requests.RequestException, ValueError, KeyError, IndexError):
        return None
