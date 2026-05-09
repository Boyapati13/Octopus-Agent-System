"""Tests for python/memory/schema.py (SQLite L2 + L3)"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from memory.schema import MemoryStore, DecisionEntry, RunState
import pytest


def test_save_and_load_decision(tmp_db):
    entry = DecisionEntry(
        title='Use SQLite', rationale='Simple and durable',
        files=['memory/schema.py'], tags=['storage'], risk='low'
    )
    new_id = tmp_db.save_decision(entry)
    assert new_id > 0
    decisions = tmp_db.load_decisions()
    assert len(decisions) == 1
    assert decisions[0]['title'] == 'Use SQLite'
    assert 'storage' in decisions[0]['tags']


def test_load_decision_by_id(tmp_db):
    new_id = tmp_db.save_decision(DecisionEntry(title='ADR-001'))
    d = tmp_db.load_decision(new_id)
    assert d['title'] == 'ADR-001'


def test_load_decision_missing_returns_none(tmp_db):
    assert tmp_db.load_decision(999) is None


def test_decisions_are_append_only(tmp_db):
    tmp_db.save_decision(DecisionEntry(title='First'))
    tmp_db.save_decision(DecisionEntry(title='Second'))
    decisions = tmp_db.load_decisions()
    assert len(decisions) == 2


def test_save_and_load_run(tmp_db):
    state = {'task': 'Add auth', 'status': 'in-progress',
              'changed_files': ['src/auth.py'], 'notes': ['Started']}
    tmp_db.save_run(state)
    loaded = tmp_db.load_run()
    assert loaded['task'] == 'Add auth'
    assert 'src/auth.py' in loaded['changed_files']


def test_run_upserts_not_duplicates(tmp_db):
    tmp_db.save_run({'task': 'First', 'status': 'idle'})
    tmp_db.save_run({'task': 'Updated', 'status': 'in-progress'})
    run = tmp_db.load_run()
    assert run['task'] == 'Updated'
    # Should still be only one active session
    rows = tmp_db.conn.execute(
        "SELECT count(*) as c FROM run_sessions WHERE status != 'compacted'"
    ).fetchone()
    assert rows['c'] == 1


def test_compact_session(tmp_db):
    tmp_db.save_run({'task': 'Feat X', 'status': 'done'})
    sid = tmp_db.compact_session('Completed feature X', ['Use async handlers'])
    assert sid > 0
    summaries = tmp_db.load_summaries()
    assert len(summaries) == 1
    assert 'Use async handlers' in summaries[0]['durable_facts']
    # Run state should now be compacted
    run = tmp_db.load_run()
    assert run['task'] == ''  # fresh empty state


def test_load_run_empty_returns_default(tmp_db):
    run = tmp_db.load_run()
    assert run['status'] == 'idle'
    assert run['changed_files'] == []
