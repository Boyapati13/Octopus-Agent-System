"""
Shared Memory Service — Flask API (port 5000).

Three core responsibilities:
  1. Context assembly  — build per-agent L5 context profile
  2. Writeback         — save agent findings back to memory
  3. Session compaction — promote run state to durable summaries

All agents (Node.js and Python) call this service.
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import os
from flask import Flask, jsonify, request
from flask_cors import CORS

from memory.schema import MemoryStore
from memory.graph_store import GraphStore
from memory.cache import CacheStore
from memory.context_builder import build_context

DB_PATH = os.environ.get('OCTOPUS_DB', str(Path(__file__).resolve().parents[2] / 'data' / 'octopus.db'))

app = Flask(__name__)
CORS(app)

store = MemoryStore(DB_PATH)
graph = GraphStore(store.conn)
cache = CacheStore()


# ── Health ───────────────────────────────────────────────────────────────────

@app.get('/health')
def health():
    return jsonify({'status': 'ok', 'cache_backend': cache.backend_type,
                    'db': DB_PATH})


# ── L5: Context assembly (primary job) ───────────────────────────────────────

@app.get('/context/<agent_name>')
def get_context(agent_name):
    task = request.args.get('task', '')
    q = request.args.get('q', task)
    ctx = build_context(agent_name, task, q, graph, store, cache)
    return jsonify(ctx)


# ── L1: Structural ───────────────────────────────────────────────────────────

@app.get('/structural/search')
def structural_search():
    q = request.args.get('q', '')
    limit = int(request.args.get('limit', 10))
    results = graph.score_relevance(q, limit)
    return jsonify(results)


@app.post('/structural/impact')
def structural_impact():
    paths = request.json.get('paths', [])
    return jsonify(graph.boundary_impact(paths))


@app.get('/structural/nodes')
def structural_nodes():
    limit = int(request.args.get('limit', 50))
    nodes = graph.all_nodes()[:limit]
    return jsonify({'count': len(graph.all_nodes()), 'nodes': nodes})


# ── L2: Decisions ────────────────────────────────────────────────────────────

@app.get('/decisions')
def get_decisions():
    tags = request.args.get('tags', '').split(',') if request.args.get('tags') else None
    limit = int(request.args.get('limit', 20))
    return jsonify(store.load_decisions(tags, limit))


@app.post('/decisions')
def post_decision():
    data = request.json
    if not data or not data.get('title'):
        return jsonify({'error': 'title required'}), 400
    new_id = store.save_decision(data)
    cache.flush()  # invalidate all context caches
    return jsonify({'ok': True, 'id': new_id}), 201


# ── L3: Run state ────────────────────────────────────────────────────────────

@app.get('/run')
def get_run():
    return jsonify(store.load_run())


@app.post('/run')
def post_run():
    store.save_run(request.json)
    cache.flush()
    return jsonify({'ok': True})


@app.post('/run/compact')
def compact():
    """Session compaction: promote durable facts, clear active session."""
    data = request.json or {}
    sid = store.compact_session(data.get('summary', ''), data.get('facts', []))
    cache.flush()
    return jsonify({'ok': True, 'summary_id': sid})


# ── Writeback (agent findings → memory) ──────────────────────────────────────

@app.post('/writeback')
def writeback():
    """
    After an agent completes, it writes findings back here.
    Supports: decision saving, run state patches, approval updates.
    """
    data = request.json or {}
    agent = data.get('agent', 'unknown')

    if decision := data.get('decision'):
        store.save_decision(decision)

    if run_patch := data.get('run_patch'):
        run = store.load_run()
        run.update(run_patch)
        store.save_run(run)

    if approval := data.get('approval'):
        run = store.load_run()
        approvals = run.get('approvals', [])
        approvals = [a for a in approvals if a.get('agent') != agent]
        approvals.append({'agent': agent, **approval})
        run['approvals'] = approvals
        store.save_run(run)

    cache.flush()
    return jsonify({'ok': True})


# ── Instincts (ECC Continuous Learning v2) ───────────────────────────────────

@app.post('/instincts')
def post_instinct():
    data = request.json or {}
    if not data.get('pattern'):
        return jsonify({'error': 'pattern required'}), 400
    new_id = store.save_instinct(data)
    cache.flush()
    return jsonify({'ok': True, 'id': new_id}), 201


@app.get('/instincts')
def get_instincts():
    category       = request.args.get('category')
    min_confidence = float(request.args.get('min_confidence', 0.5))
    limit          = int(request.args.get('limit', 20))
    return jsonify(store.load_instincts(category, min_confidence, limit))


@app.patch('/instincts/<int:instinct_id>/evolve')
def evolve_instinct(instinct_id):
    skill_id = (request.json or {}).get('skill_id')
    if not skill_id:
        return jsonify({'error': 'skill_id required'}), 400
    store.evolve_instinct(instinct_id, skill_id)
    cache.flush()
    return jsonify({'ok': True})


# ── L4: Cache stats ───────────────────────────────────────────────────────────

@app.get('/cache/stats')
def cache_stats():
    return jsonify(cache.stats())


@app.delete('/cache')
def flush_cache():
    cache.flush()
    return jsonify({'ok': True})


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    print(f'Memory service running on http://localhost:{port}')
    app.run(port=port, debug=False)
