# Octopus Agent System

A **self-evolving** AI agent harness — 14 specialist agents, 5-layer memory architecture,
self-synthesizing skill marketplace, multi-LLM gateway, browser control, caveman token
compression, and a one-command universal installer for every major LLM client.

> Octopus discovers new tools, reads their documentation, writes the integration code,
> tests it in isolation, and deploys it — while you sleep.

---

## Install on any LLM in 30 seconds

```bash
# Mac / Linux
./install.sh

# Windows
.\install.ps1
```

Auto-detects and configures: **Claude Desktop · Cursor · Windsurf · Cline · Continue.dev**
Restart your LLM client — all 20 Octopus tools appear automatically.

---

## Architecture

### 5-Layer Memory

```
L5  Task Context Profile  — ephemeral, per-agent, built on demand
L4  Prompt Cache          — Redis/Valkey optional, in-memory fallback
L3  Run State             — SQLite session tables + session compaction
L2  Decision Memory       — SQLite append-only, versioned ADRs
L1  Structural Memory     — SQLite graph facts + NetworkX runtime reasoning
```

### Self-Evolving Skill Marketplace

```
MarketScout ──► Toolsmith ──► SandboxQA ──► Cortex (CEO) ──► Active Registry
  (scout)        (synthesize)   (validate)     (deploy)         (MCP + REST)
```

Octopus is a **living system** — it detects when APIs deprecate or new libraries emerge,
reads the docs, writes a working MCP tool, tests it with self-correction, and promotes it to
production. No manual wrapper rewrites.

---

## Manual Quick Start

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

### 3 — Node environment
```bash
cd node
cp .env.example .env          # fill in API keys
npm install                   # installs all deps including agent-browser
agent-browser install         # downloads Chrome for Testing (first run only)
```

### 4 — Start everything
```bash
# Windows
.\start_mcp.ps1

# Mac / Linux
./start_mcp.sh
```

Launches Python memory service (port 5000) and Node MCP server together.

### 5 — Node API server only (port 3001)
```bash
cd node && npm run serve
```

### 6 — Dashboard
Open `frontend/index.html` in any browser.

---

## Agents (14)

| Agent | Role | Gate |
|---|---|---|
| **Cortex** | CEO / Planner — dynamic task decomposition and agent routing | ✓ |
| **Atlas** | Memory — ranked structural graph search | |
| **Architect** | Architecture — boundary impact analysis | |
| **Forge** | Implementation — scoped edit plans | |
| **FactChecker** | Verification — grounding gate vs. L1-L3 memory | ✓ |
| **Reviewer** | Quality gate — test coverage + code review | ✓ |
| **SecurityReviewer** | Security gate — OWASP Top 10 pattern scan | ✓ |
| **Probe** | Test coverage gate — symbol-level mapping | ✓ |
| **Scribe** | Documentation — changelog + doc stubs | |
| **ReleaseKeeper** | Final release gate — all prior gates must pass | ✓ |
| **Navigator** | Browser — web navigation, accessibility snapshots | |
| **MarketScout** | Market intelligence — scans GitHub, npm, PyPI for opportunities | |
| **Toolsmith** | Skill synthesis — reads docs via browser, writes MCP tools via LLM | |
| **SandboxQA** | Proving ground — validates skills, self-corrects with Toolsmith | ✓ |

Cortex selects only the agents a task requires. Gate agents (✓) halt the chain on failure.

---

## Self-Evolving Skill Marketplace

### 4-Phase Pipeline

**Phase 1 — MarketScout (Market Intelligence)**
- Hits GitHub Search API, npm registry, and PyPI for trending packages
- Detects innovations and deprecations across configurable topics
- Deduplicates against active registry, generates Skill Proposals in `data/skill_registry.json`

**Phase 2 — Toolsmith (Dynamic Skill Synthesis)**
- Navigates to the documentation URL via Navigator (browser)
- Distills up to 4,000 chars of docs and sends to the LLM gateway
- LLM writes a Node.js `run(args)` module + MCP JSON schema
- Output written to `node/skills/auto_generated/<name>.js`, registered as `sandbox`

**Phase 3 — SandboxQA (The Proving Ground)**
- Loads the synthesized skill in an isolated `require()` context
- Executes `run({})` with a 10-second timeout
- On failure: sends error logs back to Toolsmith for rewrite (up to 3 attempts)
- Only a passing skill proceeds to deployment

**Phase 4 — CEO Deployment (Cortex)**
- `skillRegistry.retire()` deprecates the outdated skill
- `skillRegistry.deploy()` promotes sandbox → active
- Tool instantly available via MCP and REST — no server restart needed

### Skill Registry format (`data/skill_registry.json`)

```json
{
  "skill_id": "skill_a1b2c3d4",
  "status": "active",
  "name": "github_graphql_v4",
  "doc_url": "https://docs.github.com/en/graphql",
  "market_alignment": "GitHub REST v3 deprecated — migrated to GraphQL v4",
  "mcp_schema": {
    "name": "github_graphql_v4",
    "description": "Execute a GraphQL query against the GitHub v4 API.",
    "inputSchema": {
      "type": "object",
      "properties": { "query_string": { "type": "string" } },
      "required": ["query_string"]
    }
  },
  "execution_binary": "./skills/auto_generated/github_graphql_v4.js",
  "qa_result": { "passed": true, "attempts": 2 },
  "synthesis_attempts": 2
}
```

**Trigger the full pipeline** — just tell any connected LLM:
> *"Evolve the skill marketplace for vector-search and LLM tooling"*
Cortex routes it automatically: `MarketScout → Toolsmith → SandboxQA → Scribe`.

---

## Tools (20)

| Tool | Safe mode | Description |
|---|---|---|
| `octopus_plan_task` | any | Cortex decomposes task into agent plan |
| `octopus_run_task_chain` | off | Full chain: plan → agents → gates → compact |
| `octopus_search_memory` | any | L1 graph search — files, symbols, summaries |
| `octopus_get_decisions` | any | L2 architectural decision log |
| `octopus_compact_session` | off | Promote run state to long-term memory |
| `octopus_read_file` | any | Read workspace file |
| `octopus_write_file` | off | Write workspace file |
| `octopus_execute_command` | off | Run shell commands in workspace |
| `octopus_create_agent` | off | Hot-reload a new specialist agent |
| `octopus_scan_security` | any | OWASP Top 10 file scan |
| `octopus_llm_complete` | any | Send prompt to active LLM provider |
| `octopus_browser_navigate` | off | Open URL + accessibility snapshot |
| `octopus_browser_snapshot` | any | Snapshot active browser page with element refs |
| `octopus_browser_interact` | off | Click / fill / type / eval on active page |
| `octopus_skill_scout` | any | MarketScout: scan GitHub, npm, PyPI |
| `octopus_skill_synthesize` | off | Toolsmith: synthesize skill from doc URL |
| `octopus_skill_validate` | off | SandboxQA: validate with self-correction |
| `octopus_skill_deploy` | off | CEO: deploy sandbox skill to active |
| `octopus_skill_retire` | off | Retire an active skill |
| `octopus_skill_list` | any | List skill registry by status |

`SAFE_MODE=true` (default) — set to `false` to enable all write/execute tools.

---

## Multi-LLM Gateway

Single gateway (`node/src/llm.js`) — swap providers with one env var, no code changes.

| Provider | `LLM_PROVIDER` | Default model |
|---|---|---|
| Anthropic (default) | `anthropic` | `claude-opus-4-7` |
| OpenAI | `openai` | `gpt-4o` |
| Google | `google` | `gemini-2.0-flash` |

```bash
# node/.env
LLM_PROVIDER=anthropic
LLM_MODEL=claude-opus-4-7   # optional override
ANTHROPIC_API_KEY=sk-ant-...
```

| Endpoint | Method | Description |
|---|---|---|
| `POST /api/llm/complete` | — | `{ prompt, maxTokens? }` → `{ text, provider, model }` |
| `GET /api/llm/provider` | — | Active provider + model |
| MCP `octopus_llm_complete` | — | Same, via MCP |

---

## Universal Tool Adapters

All 20 tool definitions live in `node/src/tools.js` and are served in every provider format.

```js
const { getTools } = require('./node/src/adapters');

// OpenAI
openai.chat.completions.create({ model: 'gpt-4o', tools: getTools('openai'), messages });

// Anthropic
anthropic.messages.create({ model: 'claude-opus-4-7', tools: getTools('anthropic'), messages });

// Gemini
genai.getGenerativeModel({ model: 'gemini-2.0-flash', tools: [getTools('gemini')] });
```

Fetch over HTTP:
```
GET http://localhost:3001/api/tools/openai
GET http://localhost:3001/api/tools/anthropic
GET http://localhost:3001/api/tools/gemini
GET http://localhost:3001/api/tools/mcp
```

---

## Browser Integration

Powered by [vercel-labs/agent-browser](https://github.com/vercel-labs/agent-browser) — native Rust CLI for AI browser control.

- Cortex spawns **Navigator** automatically for URL/web/scrape tasks
- Toolsmith uses Navigator to read documentation during skill synthesis
- Element refs (`@e1`, `@e2` …) from snapshots are deterministic handles for interactions

---

## Token Compression — Caveman

Powered by [JuliusBrussee/caveman](https://github.com/JuliusBrussee/caveman) — ~65-75% fewer tokens on prose fields, zero accuracy loss.

| Touch-point | What is compressed |
|---|---|
| MCP `ListTools` response | All tool descriptions on every LLM tool-list read |
| `runAgent()` return | `advice`, `summary`, `rationale`, `notes` on every agent response |
| `memory.writeback()` | Same fields before SQLite storage |

Code, URLs, file paths, and identifiers are always preserved.

---

## Token-Saving Design

- **Memory first** — agents query L1 graph before touching any files
- **Incremental indexing** — only changed files re-indexed (mtime hash)
- **Prompt cache** — agent contracts cached at startup (L4)
- **Session compaction** — `POST /api/memory/compact` promotes facts, clears run state
- **Narrow context** — each agent receives only what its role requires
- **Dynamic runner** — Cortex spawns only the agents a task needs
- **Grounded verification** — FactChecker validates all claims against L1-L3 memory
- **Caveman compression** — prose stripped at MCP, agent response, and storage layers

---

## REST API Reference

### Core
| Endpoint | Method | Description |
|---|---|---|
| `/api/health` | GET | Server health + cache stats |
| `/api/agents` | GET | List all registered agents |
| `/api/agent/:name/run` | POST | Run a single agent |
| `/api/task/run` | POST | Full dynamic task chain |
| `/api/plan-feature` | POST | Cortex plan only |
| `/api/onboard` | POST | Load memory, return indexed file count |
| `/api/release-check` | POST | ReleaseKeeper gate check |

### Memory
| Endpoint | Method | Description |
|---|---|---|
| `/api/memory/structural` | GET | Search structural graph (`?q=&limit=`) |
| `/api/memory/decisions` | GET | Load decision log (`?tags=&limit=`) |
| `/api/memory/run` | GET / POST | Load / save run state |
| `/api/memory/compact` | POST | Session compaction |
| `/api/memory/cache-stats` | GET | L4 cache stats |
| `/api/context/:agentName` | GET | Build L5 context for agent |
| `/api/writeback` | POST | Agent writeback |
| `/api/structural/impact` | POST | Boundary impact analysis |

### Skill Marketplace
| Endpoint | Method | Description |
|---|---|---|
| `/api/skills` | GET | List registry (`?status=active\|sandbox\|proposed\|deprecated`) |
| `/api/skills/scout` | POST | Trigger MarketScout (`{ topics: [...] }`) |
| `/api/skills/synthesize` | POST | Toolsmith (`{ name, doc_url, description }`) |
| `/api/skills/validate/:id` | POST | SandboxQA with self-correction |
| `/api/skills/deploy/:id` | POST | CEO deploy (`{ retires?: skill_id }`) |
| `/api/skills/retire/:id` | POST | Retire skill (`{ reason }`) |

### LLM & Adapters
| Endpoint | Method | Description |
|---|---|---|
| `/api/llm/complete` | POST | LLM completion (`{ prompt, maxTokens? }`) |
| `/api/llm/provider` | GET | Active provider + model |
| `/api/tools/:format` | GET | Tool definitions (openai / anthropic / gemini / mcp) |

---

## Tests

```bash
# Python
cd python && pytest tests/ -v

# Node
cd node && npm test
```

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `MEMORY_SERVICE_URL` | `http://localhost:5000` | Python memory service URL |
| `DATA_DIR` | `../data` | SQLite + JSON data directory |
| `PORT` | `3001` | Node API server port |
| `REDIS_URL` | _(empty)_ | Redis for L4 cache — falls back to in-memory |
| `SAFE_MODE` | `true` | Set `false` to enable write/execute tools |
| `LLM_PROVIDER` | `anthropic` | `anthropic` · `openai` · `google` |
| `LLM_MODEL` | _(per provider)_ | Override default model |
| `ANTHROPIC_API_KEY` | | Required when `LLM_PROVIDER=anthropic` |
| `OPENAI_API_KEY` | | Required when `LLM_PROVIDER=openai` |
| `GOOGLE_API_KEY` | | Required when `LLM_PROVIDER=google` |
