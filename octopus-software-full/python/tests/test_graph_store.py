"""Tests for python/memory/graph_store.py (L1 structural memory)"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


def test_upsert_and_get_node(tmp_graph):
    node = tmp_graph.get_node('src/app.py')
    assert node is not None
    assert 'main' in node['symbols']
    assert node['mtime'] == 1000.0


def test_node_exists(tmp_graph):
    assert tmp_graph.node_exists('src/app.py')
    assert not tmp_graph.node_exists('does/not/exist.py')


def test_get_mtime(tmp_graph):
    assert tmp_graph.get_mtime('src/app.py') == 1000.0
    assert tmp_graph.get_mtime('missing.py') == 0.0


def test_upsert_updates_existing(tmp_graph, tmp_db):
    tmp_graph.upsert_node('src/app.py', ['new_fn'], [], 'Updated', 2000.0)
    tmp_graph.commit()
    node = tmp_graph.get_node('src/app.py')
    assert 'new_fn' in node['symbols']
    assert node['mtime'] == 2000.0


def test_all_nodes_count(tmp_graph):
    nodes = tmp_graph.all_nodes()
    assert len(nodes) == 3


def test_all_edges(tmp_graph):
    edges = tmp_graph.all_edges()
    from_paths = [e['from_path'] for e in edges]
    assert 'src/app.py' in from_paths


def test_score_relevance_ranking(tmp_graph):
    results = tmp_graph.score_relevance('app', limit=10)
    assert len(results) > 0
    # src/app.py should rank high
    paths = [r['path'] for r in results]
    assert 'src/app.py' in paths
    # Verify sorted descending by score
    scores = [r['relevance_score'] for r in results]
    assert scores == sorted(scores, reverse=True)


def test_score_relevance_no_match(tmp_graph):
    results = tmp_graph.score_relevance('zzznonexistent', limit=10)
    assert results == []


def test_boundary_impact(tmp_graph):
    # tests/test_app.py imports src/app.py → boundary_impact([src/app.py]) = [tests/test_app.py]
    impacted = tmp_graph.boundary_impact(['src/app.py'])
    assert isinstance(impacted, list)


def test_find_related(tmp_graph):
    related = tmp_graph.find_related('src/app.py', depth=1)
    assert isinstance(related, list)


def test_export_json(tmp_graph, tmp_path):
    out = str(tmp_path / 'export.json')
    tmp_graph.export_json(out)
    import json
    with open(out) as f:
        data = json.load(f)
    assert 'nodes' in data
    assert 'edges' in data
    assert len(data['nodes']) == 3
