# Octopus Agent System

Memory-first software agent harness — 11 specialist agents, 5-layer memory, multi-LLM gateway,
browser control, caveman token compression, and a universal one-command installer for every major LLM client.

---

## Install on any LLM in 30 seconds

```bash
# Mac / Linux
./install.sh

# Windows
.\install.ps1
```

Auto-detects and configures: **Claude Desktop · Cursor · Windsurf · Cline · Continue.dev**
Restart your LLM client — all 14 Octopus tools appear automatically.

---

## Architecture

```
L5  Task Context Profile  — ephemeral, per-agent, built on demand
L4  Prompt Cache          — Redis/Valkey optional, in-memory fallback
L3  Run State             — SQLite session tables + session compaction
L2  Decision Memory       — SQLite append-only, versioned ADRs
L1  Structural Memory     — SQLite graph facts + NetworkX runtime reasoning
```

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

Starts the Python memory service (port 5000) and Node MCP server together.

### 5 — Node API server only (port 3001)
```bash
cd node && npm run serve
```

### 6 — Dashboard
Open `frontend/index.html` in any browser.

---

## Agents

| Agent | Role | Gate |
|---|---|---|
| Cortex | Planner / CEO — dynamic task decomposition | ✓ |
| Atlas | Memory — ranked structural graph search | |
| Architect | Architecture — boundary impact analysis | |
| Forge | Implementation — scoped edit plans | |
| FactChecker | Verification — grounding gate vs. L1-L3 memory | ✓ |
| Reviewer | Quality gate — test coverage + code review | ✓ |
| SecurityReviewer | Security gate — OWASP pattern scan | ✓ |
| Probe | Test coverage gate — symbol-level mapping | ✓ |
| Scribe | Documentation — changelog + doc stubs | |
| ReleaseKeeper | Final release gate — all gates must pass | ✓ |
| Navigator | Browser — web navigation + page capture | |
| MarketScout | Market intelligence — scans GitHub, npm, PyPI | |
| Toolsmith | Skill synthesis — reads docs, writes MCP tools via LLM | |
| SandboxQA | Proving ground — validates skills, self-corrects | ✓ |

Cortex selects only the agents a task needs. Gate agents halt the chain on failure.

---

## Self-Evolving Skill Marketplace

Octopus is a **living system** — it discovers, synthesizes, tests, and deploys its own tools while you sleep.

```
MarketScout → Toolsmith → SandboxQA → CEO (Cortex) → Active Registry
```

### 4-Phase Skill Evolution Pipeline

**Phase 1 — MarketScout (Market Intelligence)**
Scans GitHub Trending, npm registry, and PyPI for innovations and deprecations.
Generates Skill Proposals and stores them in `data/skill_registry.json`.

**Phase 2 — Toolsmith (Dynamic Skill Synthesis)**
Takes a proposal, navigates to the documentation URL via browser, distills the docs,
then uses the LLM gateway to write a working Node.js MCP tool + JSON schema.
Output is written to `node/skills/auto_generated/<name>.js`.

**Phase 3 — SandboxQA (The Proving Ground)**
Loads the generated skill in isolation and executes it against a dummy task.
On failure, sends error logs back to Toolsmith for self-correction (up to 3 attempts).
Only a passing skill proceeds.

**Phase 4 — CEO Deployment**
Cortex retires the outdated skill from the registry, publishes the new one as `active`,
and the tool is immediately available via MCP and REST.

### Skill Evolution REST API

| Endpoint | Method | Description |
|---|---|---|
| `/api/skills` | GET | List registry (`?status=active\|sandbox\|proposed\|deprecated`) |
| `/api/skills/scout` | POST | Trigger MarketScout scan (`{ topics: [...] }`) |
| `/api/skills/synthesize` | POST | Toolsmith: `{ name, doc_url, description }` |
| `/api/skills/validate/:id` | POST | SandboxQA with self-correction loop |
| `/api/skills/deploy/:id` | POST | CEO deploys to active (`{ retires?: skill_id }`) |
| `/api/skills/retire/:id` | POST | Retire skill (`{ reason }`) |

### Skill Evolution MCP Tools

| Tool | Description |
|---|---|
| `octopus_skill_scout` | Trigger market scan with topics |
| `octopus_skill_synthesize` | Synthesize skill from doc URL |
| `octopus_skill_validate` | SandboxQA with self-correction |
| `octopus_skill_deploy` | CEO deploy + optional retire |
| `octopus_skill_retire` | Retire an active skill |
| `octopus_skill_list` | List registry by status |

### Synthesized skill format (`data/skill_registry.json`)

```json
{
  "skill_id": "skill_a1b2c3d4",
  "status": "active",
  "name": "github_graphql_v4",
  "doc_url": "https://docs.github.com/en/graphql",
  "market_alignment": "Updated to GitHub GraphQL API v4 — REST v3 deprecated",
  "mcp_schema": {
    "name": "github_graphql_v4",
    "description": "Execute GraphQL query against GitHub v4 API.",
    "inputSchema": { "type": "object", "properties": { "query_string": { "type": "string" } }, "required": ["query_string"] }
  },
  "execution_binary": "./skills/auto_generated/github_graphql_v4.js",
  "qa_result": { "passed": true, "attempts": 1 }
}
```

---

## Tools (20 total)

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
| `octopus_skill_scout` | any | Trigger MarketScout market scan |
| `octopus_skill_synthesize` | off | Toolsmith: synthesize skill from doc URL |
| `octopus_skill_validate` | off | SandboxQA with self-correction loop |
| `octopus_skill_deploy` | off | CEO deploys sandbox skill to active |
| `octopus_skill_retire` | off | Retire an active skill |
| `octopus_skill_list` | any | List skill registry by status |

Set `SAFE_MODE=false` in `.env` to enable write/execute tools.

---

## Multi-LLM gateway

Single gateway (`node/src/llm.js`) — swap providers with one env var, no code changes.

| Provider | `LLM_PROVIDER` | Default model |
|---|---|---|
| Anthropic (default) | `anthropic` | `claude-opus-4-7` |
| OpenAI | `openai` | `gpt-4o` |
| Google | `google` | `gemini-2.0-flash` |

```bash
# node/.env
LLM_PROVIDER=anthropic
LLM_MODEL=claude-opus-4-7    # optional model override
ANTHROPIC_API_KEY=sk-ant-...
```

| Endpoint | Method | Description |
|---|---|---|
| `/api/llm/complete` | POST | `{ prompt, maxTokens? }` → `{ text, provider, model }` |
| `/api/llm/provider` | GET | Active provider + model info |
| MCP: `octopus_llm_complete` | — | Same, via MCP tool |

---

## Use Octopus tools in any LLM API

All tool definitions live in `node/src/tools.js` and are served in every provider's format.

```js
const { getTools } = require('./node/src/adapters');

// OpenAI
openai.chat.completions.create({
  model: 'gpt-4o',
  tools: getTools('openai'),
  messages: [{ role: 'user', content: 'Plan this feature...' }],
});

// Anthropic
anthropic.messages.create({
  model: 'claude-opus-4-7',
  tools: getTools('anthropic'),
  messages: [{ role: 'user', content: 'Plan this feature...' }],
});

// Gemini
genai.getGenerativeModel({
  model: 'gemini-2.0-flash',
  tools: [getTools('gemini')],
});
```

Or fetch over HTTP:
```
GET http://localhost:3001/api/tools/openai
GET http://localhost:3001/api/tools/anthropic
GET http://localhost:3001/api/tools/gemini
GET http://localhost:3001/api/tools/mcp
```

---

## Browser integration — agent-browser

Powered by [vercel-labs/agent-browser](https://github.com/vercel-labs/agent-browser) — native Rust CLI for AI browser control.

Cortex automatically spawns **Navigator** when a task mentions URLs, web research, scraping, or navigation.

Element refs (`@e1`, `@e2` …) returned by snapshots are deterministic handles for follow-up interactions.

---

## Token compression — caveman

Powered by [JuliusBrussee/caveman](https://github.com/JuliusBrussee/caveman) — ~65-75% fewer tokens on prose, zero accuracy loss.

| Touch-point | What is compressed |
|---|---|
| MCP `ListTools` response | All tool descriptions — every LLM tool-list read |
| `runAgent()` return value | `advice`, `summary`, `rationale`, `notes` fields |
| `memory.writeback()` | Same fields before SQLite storage |

Code, URLs, file paths, and identifiers are always preserved.

---

## Token-saving design

- **Memory first** — agents query L1 graph before opening any files
- **Incremental indexing** — only changed files re-indexed (mtime hash)
- **Prompt cache** — agent system prompts cached at startup (L4)
- **Session compaction** — `POST /api/memory/compact` promotes facts, clears run state
- **Narrow context** — each agent receives only what its role requires
- **Dynamic runner** — Cortex spawns only needed agents per task
- **Grounded verification** — FactChecker validates all claims against L1-L3 memory
- **Caveman compression** — prose stripped at MCP, agent, and storage layers

---

## REST API reference

| Endpoint | Method | Description |
|---|---|---|
| `/api/health` | GET | Server health + cache stats |
| `/api/agents` | GET | List all registered agents |
| `/api/agent/:name/run` | POST | Run a single agent |
| `/api/task/run` | POST | Run full dynamic task chain |
| `/api/plan-feature` | POST | Cortex plan only |
| `/api/onboard` | POST | Load memory, return indexed file count |
| `/api/release-check` | POST | ReleaseKeeper gate check |
| `/api/memory/structural` | GET | Search structural graph |
| `/api/memory/decisions` | GET | Load decision log |
| `/api/memory/run` | GET/POST | Load/save run state |
| `/api/memory/compact` | POST | Session compaction |
| `/api/memory/cache-stats` | GET | L4 cache stats |
| `/api/context/:agentName` | GET | Build L5 context for agent |
| `/api/writeback` | POST | Agent writeback |
| `/api/structural/impact` | POST | Boundary impact analysis |
| `/api/tools/:format` | GET | Tool definitions (openai/anthropic/gemini/mcp) |
| `/api/llm/complete` | POST | LLM completion via gateway |
| `/api/llm/provider` | GET | Active provider + model |

---

## Tests

```bash
# Python
cd python && pytest tests/ -v

# Node
cd node && npm test
```

---

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `MEMORY_SERVICE_URL` | `http://localhost:5000` | Python memory service URL |
| `DATA_DIR` | `../data` | SQLite + JSON data directory |
| `PORT` | `3001` | Node API server port |
| `REDIS_URL` | _(empty)_ | Redis for L4 cache — falls back to in-memory |
| `SAFE_MODE` | `true` | Disable write/execute MCP tools |
| `LLM_PROVIDER` | `anthropic` | `anthropic` · `openai` · `google` |
| `LLM_MODEL` | _(per provider)_ | Override default model |
| `ANTHROPIC_API_KEY` | | Required when `LLM_PROVIDER=anthropic` |
| `OPENAI_API_KEY` | | Required when `LLM_PROVIDER=openai` |
| `GOOGLE_API_KEY` | | Required when `LLM_PROVIDER=google` |
