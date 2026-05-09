"""
L4 Cache — Redis/Valkey optional, in-memory fallback.

Redis is never a hard dependency. The system runs identically without it;
cache misses just cost a rebuild of the context profile.
"""
import json
import time
from typing import Any, Optional


class _InMemoryCache:
    """Simple TTL dict fallback when Redis is unavailable."""

    def __init__(self):
        self._store: dict = {}

    def get(self, key: str) -> Optional[Any]:
        entry = self._store.get(key)
        if entry is None:
            return None
        value, expires_at = entry
        if expires_at and time.time() > expires_at:
            del self._store[key]
            return None
        return value

    def set(self, key: str, value: Any, ttl: int = 300):
        expires_at = time.time() + ttl if ttl else None
        self._store[key] = (value, expires_at)

    def delete(self, key: str):
        self._store.pop(key, None)

    def flush(self):
        self._store.clear()

    def size(self) -> int:
        return len(self._store)


class CacheStore:
    """
    Unified cache interface.
    Tries Redis on init; silently falls back to in-memory dict.
    """

    def __init__(self, redis_url: str = 'redis://localhost:6379/0'):
        self._hits = 0
        self._misses = 0
        self._backend_name = 'memory'
        try:
            import redis
            client = redis.from_url(redis_url, socket_connect_timeout=1, decode_responses=True)
            client.ping()
            self._redis = client
            self._mem = None
            self._backend_name = 'redis'
        except Exception:
            self._redis = None
            self._mem = _InMemoryCache()

    @property
    def backend_type(self) -> str:
        return self._backend_name

    def get(self, key: str) -> Optional[Any]:
        raw = None
        if self._redis:
            raw = self._redis.get(key)
            if raw:
                raw = json.loads(raw)
        else:
            raw = self._mem.get(key)
        if raw is None:
            self._misses += 1
        else:
            self._hits += 1
        return raw

    def set(self, key: str, value: Any, ttl: int = 300):
        if self._redis:
            self._redis.setex(key, ttl, json.dumps(value))
        else:
            self._mem.set(key, value, ttl)

    def invalidate(self, key: str):
        if self._redis:
            self._redis.delete(key)
        else:
            self._mem.delete(key)

    def flush(self):
        if self._redis:
            self._redis.flushdb()
        else:
            self._mem.flush()

    def stats(self) -> dict:
        total = self._hits + self._misses
        return {
            'backend': self._backend_name,
            'hits': self._hits,
            'misses': self._misses,
            'hit_rate': round(self._hits / total, 3) if total else 0.0,
            'size': self._mem.size() if self._mem else None,
        }
