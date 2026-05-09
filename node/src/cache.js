'use strict';
/**
 * L4 Cache — ioredis optional, in-memory Map fallback.
 * Mirrors the Python CacheStore interface so Node agents can cache
 * hot fragments without hitting the memory service on every call.
 */

class MemoryFallback {
  constructor() { this._store = new Map(); }
  get(key) {
    const entry = this._store.get(key);
    if (!entry) return null;
    if (entry.exp && Date.now() > entry.exp) { this._store.delete(key); return null; }
    return entry.value;
  }
  set(key, value, ttl = 300) {
    this._store.set(key, { value, exp: ttl ? Date.now() + ttl * 1000 : null });
  }
  del(key) { this._store.delete(key); }
  flush() { this._store.clear(); }
  size() { return this._store.size; }
}

let _client = null;
let _mem = null;
let _backend = 'memory';

function _init() {
  if (_client || _mem) return;
  try {
    const Redis = require('ioredis');
    const r = new Redis({ lazyConnect: true, connectTimeout: 1000 });
    r.connect().then(() => { _client = r; _backend = 'redis'; }).catch(() => {
      _mem = new MemoryFallback();
    });
  } catch {
    _mem = new MemoryFallback();
  }
}

async function get(key) {
  _init();
  if (_client) {
    const raw = await _client.get(key);
    return raw ? JSON.parse(raw) : null;
  }
  return _mem ? _mem.get(key) : null;
}

async function set(key, value, ttl = 300) {
  _init();
  if (_client) return _client.setex(key, ttl, JSON.stringify(value));
  if (_mem) _mem.set(key, value, ttl);
}

async function del(key) {
  _init();
  if (_client) return _client.del(key);
  if (_mem) _mem.del(key);
}

function backendType() { return _backend; }

module.exports = { get, set, del, backendType };
