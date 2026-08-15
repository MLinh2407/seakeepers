import requests

from config import OPENWEATHERMAP_API_KEY

OWM_URL = "https://api.openweathermap.org/data/2.5/weather"


def get_weather_snapshot(lat, lon):
    """
    Fetch current weather conditions at a coordinate, returned as a short
    human-readable string (e.g. "Clear, 24.1°C, wind 3.2 m/s").
    Returns None if no API key is configured or the request fails —
    report submission should never be blocked by a weather API hiccup.
    """
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
    except (requests.RequestException, KeyError, IndexError):
        return None
