"""
Builds import edges in the SQLite graph from indexed node data.
Called after upsert_node() on all changed files.
"""
from typing import List, Dict, TYPE_CHECKING

if TYPE_CHECKING:
    from memory.graph_store import GraphStore


def build_graph(graph: 'GraphStore', entries: List[Dict]):
    """
    For each newly indexed entry, resolve its imports to known node paths
    and write directed edges into structural_edges.
    """
    # Build a quick lookup: module-like token → path
    all_nodes = graph.all_nodes()
    path_index = {n['path']: n for n in all_nodes}
    # map stem names to paths for fuzzy resolution
    stem_index: Dict[str, str] = {}
    for p in path_index:
        from pathlib import Path
        stem = Path(p).stem
        stem_index.setdefault(stem, p)

    for entry in entries:
        from_path = entry['path']
        for imp in entry.get('imports', []):
            # Try to resolve import string to a known file path
            target = _resolve_import(imp, from_path, path_index, stem_index)
            if target and target != from_path:
                graph.upsert_edge(from_path, target)


def _resolve_import(imp: str, from_path: str, path_index: dict, stem_index: dict) -> str:
    """Best-effort resolution of an import string to a repo path."""
    from pathlib import Path, PurePosixPath

    # Exact path match (e.g., './memory/schema' → 'python/memory/schema.py')
    candidates = [
        imp,
        imp.replace('.', '/') + '.py',
        imp.replace('.', '/') + '.js',
        imp.lstrip('./').replace('.', '/') + '.py',
    ]
    for c in candidates:
        if c in path_index:
            return c

    # Stem match (last component of dotted import)
    last = imp.split('.')[-1].split('/')[-1]
    if last in stem_index:
        return stem_index[last]

    return None
