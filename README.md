# Octopus Agent System

Memory-first software agent harness with a 5-layer memory architecture,
11 specialist agents, a dynamic skills registry, a shared memory service, REST API, an MCP Server, and a dashboard UI.

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

### 3 — Setup Environment
```bash
cd node
cp .env.example .env
npm install               # installs all deps including agent-browser
agent-browser install     # downloads Chrome for Testing (first run only)
```

### 4 — Node API server (port 3001)
```bash
npm run serve
```

### 5 — Model Context Protocol (MCP) Server
Octopus acts as an MCP server, allowing any compatible LLM (Claude Desktop, Cursor, etc.) to use it as a memory and planning backend. 

The Python memory service must be running alongside the Node MCP server. Use the unified startup scripts to launch both simultaneously:

**For Windows (PowerShell):**
```powershell
.\start_mcp.ps1
```

**For macOS/Linux:**
```bash
./start_mcp.sh
```

*(Note: In Claude Desktop's `claude_desktop_config.json`, configure the command to execute this unified script rather than just `node`)*

### 6 — Open the dashboard
Open `frontend/index.html` in a browser (or serve with any static server).

---

## Agents

| Agent | Role | Approves |
|---|---|---|
| Cortex | Planner — decomposes tasks, assigns agents dynamically | ✓ |
| Atlas | Memory — ranked structural search | — |
| Architect | Architecture — boundary impact analysis | — |
| Forge | Implementation — scoped edit plans | — |
| FactChecker | Verification — validates claims against memory | ✓ |
| Reviewer | Review — quality gate, test coverage | ✓ |
| SecurityReviewer | Security — pattern scan for risks | ✓ |
| Probe | Testing — coverage map, untested symbols | ✓ |
| Scribe | Documentation — changelog + doc stubs | — |
| ReleaseKeeper | Release — validates all gates | ✓ |
| Navigator | Browser — web navigation and page capture via agent-browser | — |

## Tests

```bash
# Python
cd python && pytest tests/ -v

# Node
cd node && npm test
```

## Browser integration (agent-browser)

Octopus integrates [agent-browser](https://github.com/vercel-labs/agent-browser) — a native Rust CLI for AI-driven browser control.

### Setup
```bash
cd node
npm install          # installs agent-browser
agent-browser install  # downloads Chrome for Testing (first run only)
```

### Navigator agent
Cortex automatically spawns **Navigator** when a task mentions URLs, web research, scraping, or navigation keywords.

### MCP browser tools (require `SAFE_MODE=false`)
| Tool | Description |
|---|---|
| `octopus_browser_navigate` | Open a URL and return a page snapshot |
| `octopus_browser_snapshot` | Capture accessibility tree + element refs from active session |
| `octopus_browser_interact` | Click, fill, type, or eval JS on the current page |

Element refs (`@e1`, `@e2` …) from snapshots are deterministic handles for follow-up interactions.

---

## Token-saving design

- **Memory first**: agents query the graph before opening any files
- **Incremental indexing**: only changed files are re-indexed (mtime hash)
- **Static prefix caching**: agent contracts cached at startup (L4)
- **Session compaction**: `POST /api/memory/compact` promotes durable facts, clears run state
- **Narrow context**: each agent gets only what its role requires via the skills registry
- **Dynamic runner**: `Cortex` plans the chain, spawning only needed agents per task
- **Grounded Verification**: `FactChecker` ensures all proposed actions trace back to L1-L3 indexed memory
