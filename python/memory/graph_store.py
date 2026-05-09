"""
L1 Structural memory.

Persistence:  SQLite tables (structural_nodes, structural_edges).
Runtime view: NetworkX DiGraph loaded on-demand for graph algorithms
              (BFS, boundary impact, relevance scoring).

NetworkX is NOT the storage backend — it is a transient reasoning layer
over the persisted SQL facts.
"""
import json
import sqlite3
from typing import List, Dict, Optional

try:
    import networkx as nx
    HAS_NX = True
except ImportError:
    HAS_NX = False


class GraphStore:

    def __init__(self, conn: sqlite3.Connection):
        self.conn = conn

    # ── Persistence (SQLite) ─────────────────────────────────────────────────

    def upsert_node(self, path: str, symbols: List[str], imports: List[str],
                    summary: str, mtime: float):
        self.conn.execute(
            """INSERT INTO structural_nodes (path, symbols, imports, summary, mtime, updated_at)
               VALUES (?, ?, ?, ?, ?, datetime('now'))
               ON CONFLICT(path) DO UPDATE SET
                   symbols=excluded.symbols, imports=excluded.imports,
                   summary=excluded.summary, mtime=excluded.mtime,
                   updated_at=datetime('now')""",
            (path, json.dumps(symbols), json.dumps(imports), summary, mtime)
        )

    def upsert_edge(self, from_path: str, to_path: str, edge_type: str = 'import'):
        self.conn.execute(
            "INSERT OR IGNORE INTO structural_edges (from_path,to_path,edge_type) VALUES (?,?,?)",
            (from_path, to_path, edge_type)
        )

    def commit(self):
        self.conn.commit()

    def get_node(self, path: str) -> Optional[Dict]:
        row = self.conn.execute(
            "SELECT * FROM structural_nodes WHERE path=?", (path,)
        ).fetchone()
        if not row:
            return None
        d = dict(row)
        d['symbols'] = json.loads(d['symbols'])
        d['imports'] = json.loads(d['imports'])
        return d

    def all_nodes(self) -> List[Dict]:
        rows = self.conn.execute("SELECT * FROM structural_nodes").fetchall()
        result = []
        for r in rows:
            d = dict(r)
            d['symbols'] = json.loads(d['symbols'])
            d['imports'] = json.loads(d['imports'])
            result.append(d)
        return result

    def all_edges(self) -> List[Dict]:
        rows = self.conn.execute("SELECT * FROM structural_edges").fetchall()
        return [dict(r) for r in rows]

    def node_exists(self, path: str) -> bool:
        return self.conn.execute(
            "SELECT 1 FROM structural_nodes WHERE path=?", (path,)
        ).fetchone() is not None

    def get_mtime(self, path: str) -> float:
        row = self.conn.execute(
            "SELECT mtime FROM structural_nodes WHERE path=?", (path,)
        ).fetchone()
        return row['mtime'] if row else 0.0

    # ── Runtime reasoning (NetworkX, loaded on-demand) ───────────────────────

    def _load_subgraph(self, seed_paths: List[str], depth: int = 2):
        """BFS from seed paths up to `depth` hops; returns nx.DiGraph or dict fallback."""
        if not HAS_NX:
            return None
        G = nx.DiGraph()
        visited = set()
        frontier = set(seed_paths)
        for _ in range(depth):
            next_frontier = set()
            for p in frontier:
                if p in visited:
                    continue
                visited.add(p)
                node = self.get_node(p)
                if node:
                    G.add_node(p, **{k: v for k, v in node.items() if k != 'path'})
                rows = self.conn.execute(
                    "SELECT to_path FROM structural_edges WHERE from_path=?", (p,)
                ).fetchall()
                for row in rows:
                    tp = row['to_path']
                    G.add_edge(p, tp)
                    if tp not in visited:
                        next_frontier.add(tp)
            frontier = next_frontier
        return G

    def score_relevance(self, query: str, limit: int = 10) -> List[Dict]:
        """
        Score every node against query; return ranked list.
        Score = path-match×3 + symbol-match×2 + summary-match×1
        """
        q = query.lower()
        nodes = self.all_nodes()
        scored = []
        for n in nodes:
            score = 0
            if q in n['path'].lower():
                score += 3
            if any(q in s.lower() for s in n['symbols']):
                score += 2
            if q in n['summary'].lower():
                score += 1
            if score > 0:
                scored.append({**n, 'relevance_score': score})
        scored.sort(key=lambda x: x['relevance_score'], reverse=True)
        return scored[:limit]

    def boundary_impact(self, paths: List[str]) -> List[str]:
        """
        Return all files that import any of the given paths (reverse edge traversal).
        Uses SQL for efficiency — no NetworkX needed for this operation.
        """
        if not paths:
            return []
        placeholders = ','.join('?' * len(paths))
        rows = self.conn.execute(
            f"SELECT DISTINCT from_path FROM structural_edges WHERE to_path IN ({placeholders})",
            paths
        ).fetchall()
        return [r['from_path'] for r in rows]

    def find_related(self, path: str, depth: int = 2) -> List[str]:
        """BFS neighbours of a node up to `depth` hops."""
        G = self._load_subgraph([path], depth)
        if G is None:
            # Fallback without networkx
            rows = self.conn.execute(
                "SELECT to_path FROM structural_edges WHERE from_path=?", (path,)
            ).fetchall()
            return [r['to_path'] for r in rows]
        return [n for n in G.nodes if n != path]

    def export_json(self, out_path: str):
        """Export graph to JSON for debug/legacy compatibility."""
        data = {'nodes': self.all_nodes(), 'edges': self.all_edges()}
        with open(out_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2)
