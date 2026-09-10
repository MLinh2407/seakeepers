import json

import redis

from config import REDIS_ENABLED, REDIS_HOST, REDIS_PORT

_client = None


def _get_client():
    global _client
    if _client is None:
        _client = redis.Redis(
            host=REDIS_HOST,
            port=REDIS_PORT,
            decode_responses=True,
            socket_connect_timeout=3,
            socket_timeout=3,
        )
    return _client


def cache_get(key):
    """Fetches JSON value from Redis by key, returning None on miss, error, or disabled cache."""
    if not REDIS_ENABLED:
        return None
    try:
        raw = _get_client().get(key)
        return json.loads(raw) if raw else None
    except (redis.RedisError, ValueError):
        # Treat corrupted/invalid JSON as a cache miss
        return None


def cache_set(key, value, ttl_seconds=300):
    """Stores a JSON serializable value in Redis with a TTL, failing silently on error."""
    if not REDIS_ENABLED:
        return
    try:
        _get_client().setex(key, ttl_seconds, json.dumps(value))
    except redis.RedisError:
        pass
