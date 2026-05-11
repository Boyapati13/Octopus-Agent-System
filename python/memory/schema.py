"""
L2 + L3 memory: SQLite-backed decisions and run state.
JSON files are kept only as legacy export artifacts.
"""
import sqlite3
import json
from pathlib import Path
from dataclasses import dataclass, asdict, field
from typing import List, Dict, Any, Optional

SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS structural_nodes (
    path        TEXT PRIMARY KEY,
    symbols     TEXT DEFAULT '[]',
    imports     TEXT DEFAULT '[]',
    summary     TEXT DEFAULT '',
    mtime       REAL DEFAULT 0,
    updated_at  TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS structural_edges (
    from_path   TEXT NOT NULL,
    to_path     TEXT NOT NULL,
    edge_type   TEXT DEFAULT 'import',
    PRIMARY KEY (from_path, to_path, edge_type)
);
CREATE TABLE IF NOT EXISTS decisions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    title       TEXT NOT NULL,
    rationale   TEXT DEFAULT '',
    rejected    TEXT DEFAULT '[]',
    files       TEXT DEFAULT '[]',
    tags        TEXT DEFAULT '[]',
    risk        TEXT DEFAULT 'low',
    created_at  TEXT DEFAULT (datetime('now')),
    version     INTEGER DEFAULT 1
);
CREATE TABLE IF NOT EXISTS run_sessions (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    task          TEXT DEFAULT '',
    status        TEXT DEFAULT 'idle',
    branch        TEXT DEFAULT '',
    changed_files TEXT DEFAULT '[]',
    blockers      TEXT DEFAULT '[]',
    approvals     TEXT DEFAULT '[]',
    notes         TEXT DEFAULT '[]',
    started_at    TEXT DEFAULT (datetime('now')),
    ended_at      TEXT
);
CREATE TABLE IF NOT EXISTS session_summaries (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id    INTEGER REFERENCES run_sessions(id),
    summary       TEXT DEFAULT '',
    durable_facts TEXT DEFAULT '[]',
    compacted_at  TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS instincts (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    pattern      TEXT NOT NULL,
    confidence   REAL DEFAULT 0.5,
    occurrences  INTEGER DEFAULT 1,
    category     TEXT DEFAULT 'general',
    sources      TEXT DEFAULT '[]',
    skill_id     TEXT,
    created_at   TEXT DEFAULT (datetime('now')),
    updated_at   TEXT DEFAULT (datetime('now'))
);
"""


@dataclass
class DecisionEntry:
    title: str
    rationale: str = ''
    rejected: List[str] = field(default_factory=list)
    files: List[str] = field(default_factory=list)
    tags: List[str] = field(default_factory=list)
    risk: str = 'low'


@dataclass
class RunState:
    task: str = ''
    status: str = 'idle'
    branch: str = ''
    changed_files: List[str] = field(default_factory=list)
    blockers: List[str] = field(default_factory=list)
    approvals: List[Dict] = field(default_factory=list)
    notes: List[str] = field(default_factory=list)


class MemoryStore:
    """SQLite-backed store for L2 decisions and L3 run state."""

    def __init__(self, db_path: str):
        Path(db_path).parent.mkdir(parents=True, exist_ok=True)
        self.conn = sqlite3.connect(db_path, check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        self.conn.executescript(SCHEMA_SQL)
        self.conn.commit()

    # ── L2: Decisions ────────────────────────────────────────────────────────

    def save_decision(self, entry) -> int:
        d = asdict(entry) if isinstance(entry, DecisionEntry) else entry
        cur = self.conn.execute(
            "INSERT INTO decisions (title,rationale,rejected,files,tags,risk) VALUES (?,?,?,?,?,?)",
            (d['title'], d.get('rationale', ''),
             json.dumps(d.get('rejected', [])),
             json.dumps(d.get('files', [])),
             json.dumps(d.get('tags', [])),
             d.get('risk', 'low')),
        )
        self.conn.commit()
        return cur.lastrowid

    def load_decisions(self, tags: Optional[List[str]] = None, limit: int = 20) -> List[Dict]:
        rows = self.conn.execute(
            "SELECT * FROM decisions ORDER BY created_at DESC LIMIT ?", (limit,)
        ).fetchall()
        results = [dict(r) for r in rows]
        for r in results:
            for k in ('rejected', 'files', 'tags'):
                r[k] = json.loads(r[k])
        if tags:
            results = [r for r in results if any(t in r['tags'] for t in tags)]
        return results

    def load_decision(self, decision_id: int) -> Optional[Dict]:
        row = self.conn.execute(
            "SELECT * FROM decisions WHERE id = ?", (decision_id,)
        ).fetchone()
        if not row:
            return None
        d = dict(row)
        for k in ('rejected', 'files', 'tags'):
            d[k] = json.loads(d[k])
        return d

    # ── L3: Run state ────────────────────────────────────────────────────────

    def save_run(self, state: Dict) -> int:
        existing = self.conn.execute(
            "SELECT id FROM run_sessions WHERE status != 'compacted' ORDER BY started_at DESC LIMIT 1"
        ).fetchone()
        vals = (
            state.get('task', ''), state.get('status', 'idle'), state.get('branch', ''),
            json.dumps(state.get('changed_files', [])), json.dumps(state.get('blockers', [])),
            json.dumps(state.get('approvals', [])), json.dumps(state.get('notes', [])),
        )
        if existing:
            self.conn.execute(
                "UPDATE run_sessions SET task=?,status=?,branch=?,changed_files=?,blockers=?,approvals=?,notes=? WHERE id=?",
                vals + (existing['id'],)
            )
            self.conn.commit()
            return existing['id']
        cur = self.conn.execute(
            "INSERT INTO run_sessions (task,status,branch,changed_files,blockers,approvals,notes) VALUES (?,?,?,?,?,?,?)",
            vals
        )
        self.conn.commit()
        return cur.lastrowid

    def load_run(self) -> Dict:
        row = self.conn.execute(
            "SELECT * FROM run_sessions WHERE status != 'compacted' ORDER BY started_at DESC LIMIT 1"
        ).fetchone()
        if not row:
            return asdict(RunState())
        d = dict(row)
        for k in ('changed_files', 'blockers', 'approvals', 'notes'):
            d[k] = json.loads(d[k])
        return d

    def compact_session(self, summary: str, durable_facts: List[str]) -> int:
        run = self.load_run()
        sid = run.get('id')
        if sid:
            self.conn.execute(
                "UPDATE run_sessions SET status='compacted', ended_at=datetime('now') WHERE id=?",
                (sid,)
            )
        cur = self.conn.execute(
            "INSERT INTO session_summaries (session_id,summary,durable_facts) VALUES (?,?,?)",
            (sid, summary, json.dumps(durable_facts))
        )
        self.conn.commit()
        return cur.lastrowid

    def load_summaries(self, limit: int = 10) -> List[Dict]:
        rows = self.conn.execute(
            "SELECT * FROM session_summaries ORDER BY compacted_at DESC LIMIT ?", (limit,)
        ).fetchall()
        results = [dict(r) for r in rows]
        for r in results:
            r['durable_facts'] = json.loads(r['durable_facts'])
        return results

    # ── Instincts (ECC Continuous Learning v2) ───────────────────────────────

    def save_instinct(self, instinct: dict) -> int:
        pattern    = instinct.get('pattern', '')
        confidence = float(instinct.get('confidence', 0.5))
        category   = instinct.get('category', 'general')
        sources    = json.dumps(instinct.get('sources', []))

        # Upsert by pattern similarity (exact match only — clustering done in Node)
        existing = self.conn.execute(
            "SELECT id, occurrences, confidence FROM instincts WHERE pattern = ?", (pattern,)
        ).fetchone()

        if existing:
            new_occ  = existing['occurrences'] + 1
            new_conf = min(1.0, max(existing['confidence'], confidence) + 0.05)
            self.conn.execute(
                "UPDATE instincts SET occurrences=?, confidence=?, updated_at=datetime('now') WHERE id=?",
                (new_occ, round(new_conf, 3), existing['id'])
            )
            self.conn.commit()
            return existing['id']

        cur = self.conn.execute(
            "INSERT INTO instincts (pattern, confidence, occurrences, category, sources) VALUES (?,?,?,?,?)",
            (pattern, round(confidence, 3), instinct.get('occurrences', 1), category, sources)
        )
        self.conn.commit()
        return cur.lastrowid

    def load_instincts(self, category: str = None, min_confidence: float = 0.5,
                       limit: int = 20) -> list:
        if category:
            rows = self.conn.execute(
                "SELECT * FROM instincts WHERE category=? AND confidence>=? ORDER BY confidence DESC LIMIT ?",
                (category, min_confidence, limit)
            ).fetchall()
        else:
            rows = self.conn.execute(
                "SELECT * FROM instincts WHERE confidence>=? ORDER BY confidence DESC LIMIT ?",
                (min_confidence, limit)
            ).fetchall()
        results = [dict(r) for r in rows]
        for r in results:
            r['sources'] = json.loads(r['sources'])
        return results

    def evolve_instinct(self, instinct_id: int, skill_id: str) -> bool:
        self.conn.execute(
            "UPDATE instincts SET skill_id=?, updated_at=datetime('now') WHERE id=?",
            (skill_id, instinct_id)
        )
        self.conn.commit()
        return True

    def close(self):
        self.conn.close()
