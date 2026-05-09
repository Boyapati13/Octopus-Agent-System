"""Tests for python/services/memory_service.py (Flask API)"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest
import os


@pytest.fixture
def client(tmp_path):
    os.environ['OCTOPUS_DB'] = str(tmp_path / 'test.db')
    import importlib
    import services.memory_service as svc
    importlib.reload(svc)
    svc.app.config['TESTING'] = True
    with svc.app.test_client() as c:
        yield c


def test_health(client):
    r = client.get('/health')
    assert r.status_code == 200
    data = r.get_json()
    assert data['status'] == 'ok'
    assert 'cache_backend' in data


def test_structural_search_empty(client):
    r = client.get('/structural/search?q=app')
    assert r.status_code == 200
    assert r.get_json() == []


def test_post_and_get_decision(client):
    r = client.post('/decisions', json={'title': 'ADR-001', 'rationale': 'Test'})
    assert r.status_code == 201
    r2 = client.get('/decisions')
    data = r2.get_json()
    assert len(data) == 1
    assert data[0]['title'] == 'ADR-001'


def test_post_decision_missing_title(client):
    r = client.post('/decisions', json={'rationale': 'No title'})
    assert r.status_code == 400


def test_run_state_roundtrip(client):
    client.post('/run', json={'task': 'Build feature', 'status': 'in-progress'})
    r = client.get('/run')
    assert r.get_json()['task'] == 'Build feature'


def test_compact_session(client):
    client.post('/run', json={'task': 'Done task', 'status': 'done'})
    r = client.post('/run/compact', json={'summary': 'Completed', 'facts': ['Fact A']})
    assert r.status_code == 200
    assert r.get_json()['ok'] is True


def test_writeback_approval(client):
    client.post('/run', json={'task': 'T', 'status': 'review'})
    r = client.post('/writeback', json={
        'agent': 'reviewer',
        'approval': {'approved': True, 'note': 'LGTM'}
    })
    assert r.status_code == 200
    run = client.get('/run').get_json()
    approvals = run.get('approvals', [])
    assert any(a.get('agent') == 'reviewer' for a in approvals)


def test_cache_stats(client):
    r = client.get('/cache/stats')
    data = r.get_json()
    assert 'hits' in data
    assert 'backend' in data


def test_context_assembly(client):
    r = client.get('/context/atlas?task=auth&q=auth')
    assert r.status_code == 200
    data = r.get_json()
    assert data['agent'] == 'atlas'
    assert 'relevant_files' in data
