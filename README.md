# Octopus Agent System

Memory-first software agent harness with a 5-layer memory architecture,
9 specialist agents, a shared memory service, REST API, and dashboard UI.

## Architecture

```
L5 Task Context Profile  — ephemeral, per-agent, built on demand
L4 Prompt Cache          — Redis/Valkey optional, in-memory fallback
L3 Run State             — SQLite session tables + session compaction
L2 Decision Memory       — SQLite append-only, versioned ADRs
L1 Structural Memory     — SQLite graph facts + NetworkX runtime reasoning
```

## Quick Start

### 1 — Python memory service (port 5000)
```bash
cd python
pip install -r requirements.txt
python services/memory_service.py
```

### 2 — Index the repo
```bash
python python/indexer/index_repo.py --root . --db ./data/octopus.db
```

### 3 — Node API server (port 3001)
```bash
cd node
npm install
npm run serve
```

### 4 — Open the dashboard
Open `frontend/index.html` in a browser (or serve with any static server).

---

## Agents

| Agent | Role | Approves |
|---|---|---|
| Cortex | Planner — decomposes tasks, assigns agents | ✓ |
| Atlas | Memory — ranked structural search | — |
| Architect | Architecture — boundary impact analysis | — |
| Forge | Implementation — scoped edit plans | — |
| Reviewer | Review — quality gate, test coverage | ✓ |
| SecurityReviewer | Security — pattern scan for risks | ✓ |
| Probe | Testing — coverage map, untested symbols | ✓ |
| Scribe | Documentation — changelog + doc stubs | — |
| ReleaseKeeper | Release — validates all gates | ✓ |

## Tests

```bash
# Python
cd python && pytest tests/ -v

# Node
cd node && npm test
```

## Token-saving design

- **Memory first**: agents query the graph before opening any files
- **Incremental indexing**: only changed files are re-indexed (mtime hash)
- **Static prefix caching**: agent contracts cached at startup (L4)
- **Session compaction**: `POST /run/compact` promotes durable facts, clears run state
- **Narrow context**: each agent gets only what its role requires
