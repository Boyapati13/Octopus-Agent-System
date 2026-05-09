"""Shared pytest fixtures: tmp SQLite DB, populated MemoryStore and GraphStore."""
import sqlite3
import pytest
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from memory.schema import MemoryStore
from memory.graph_store import GraphStore


@pytest.fixture
def tmp_db(tmp_path):
    db_path = str(tmp_path / 'test.db')
    store = MemoryStore(db_path)
    yield store
    store.close()


@pytest.fixture
def tmp_graph(tmp_db):
    graph = GraphStore(tmp_db.conn)
    graph.upsert_node('src/app.py', ['main', 'App'], ['os', 'memory.schema'], 'Entry point', 1000.0)
    graph.upsert_node('src/utils.py', ['helper', 'format_str'], ['re'], 'Utilities', 900.0)
    graph.upsert_node('tests/test_app.py', ['test_main'], ['src.app'], 'App tests', 800.0)
    graph.upsert_edge('src/app.py', 'src/utils.py')
    graph.upsert_edge('tests/test_app.py', 'src/app.py')
    graph.commit()
    return graph
