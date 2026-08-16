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
    """Return the cached value for `key`, or None on a miss, a disabled
    cache, OR any Redis error (connection issue, timeout, etc). Analytics
    should still work -- just slower -- if the cache is unreachable."""
    if not REDIS_ENABLED:
        return None
    try:
        raw = _get_client().get(key)
        return json.loads(raw) if raw else None
    except redis.RedisError:
        return None


def cache_set(key, value, ttl_seconds=5):
    """Store `value` (must be JSON-serializable) under `key` with a TTL.
    No-ops if the cache is disabled, and fails silently on any Redis error --
    a cache write failing should never break a response that's already
    been computed."""
    if not REDIS_ENABLED:
        return
    try:
        _get_client().setex(key, ttl_seconds, json.dumps(value))
    except redis.RedisError:
        pass
