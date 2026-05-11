# 🐙 Octopus Agent System

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![Tests](https://img.shields.io/badge/tests-63%20passing-brightgreen)](#testing)
[![Agents](https://img.shields.io/badge/agents-14-blue)](#agents)
[![Tools](https://img.shields.io/badge/MCP%20tools-20-purple)](#mcp-tools)

A **self-evolving** multi-agent AI system. Cortex uses an LLM to plan which agents are needed for each task, the runner auto-synthesises missing agents on demand, and the Skill Marketplace discovers new tools, reads their docs, writes integration code, validates it in an isolated Worker thread, and deploys — automatically.

Works with **Claude · GPT-4o · Gemini · Ollama** (local). Exposes 20 tools via MCP, installs into Claude Desktop / Cursor / Windsurf in one command.

---

## Quick Install (any LLM client)

```bash
# Mac / Linux
./install.sh

# Windows
.\install.ps1
```

Restart your LLM client — all 20 Octopus tools appear automatically.

---

## What happens on every git push

```
git push  →  GitHub Actions fires
              ├── npm test (63 tests)
              ├── Cortex plans agents via LLM
              ├── Agent chain runs (auto-creates stubs for unknown agents)
              ├── Navigator browses any URLs in the commit message
              ├── MarketScout scans new packages in package.json / requirements.txt
              ├── Toolsmith synthesises MCP skills from their docs
              ├── SandboxQA validates in isolated Worker thread (self-corrects 3×)
              └── Auto-commits synthesised skills back to repo [skip ci]
```

Local hook (fires in background, non-blocking):
```bash
bash scripts/install-hooks.sh   # one-time setup
```

---

## Architecture

### 5-Layer Memory

```
L5  Task Context Profile    ephemeral, per-agent, built on demand
L4  Prompt Cache            Redis/Valkey optional, in-memory fallback
L3  Run State               SQLite session + compaction
L2  Decision Memory         SQLite append-only ADRs
L1  Structural Memory       SQLite graph facts + NetworkX runtime reasoning
```

### Self-Evolving Skill Marketplace

```
MarketScout → Toolsmith → SandboxQA (Worker thread) → Cortex CEO → Active Registry
  scout        synthesise   validate + self-correct      approve       MCP + REST
```

### LLM-Backed Planning

Cortex calls the active LLM with the full list of registered agents (including dynamically-created ones) and asks it to pick the minimal ordered set for the task. Falls back to regex routing if the LLM is unavailable.

### Parallel QA Execution

The runner groups consecutive review agents (Reviewer, SecurityReviewer, Probe, FactChecker) into a single parallel stage using `Promise.allSettled`. On the default 9-agent chain this collapses four sequential gate checks into one wall-clock round — a **~75% reduction** in QA phase time. All gate failures in a parallel stage are collected and reported together before the chain is stopped.

```
Before:  Atlas → Forge → Reviewer → SecurityReviewer → Probe → FactChecker → Scribe
                          ↑ sequential — each waits for the previous

After:   Atlas → Forge → [Reviewer ‖ SecurityReviewer ‖ Probe ‖ FactChecker] → Scribe
                          ↑ parallel — all four run simultaneously
```

### Deterministic Guardrails

Three hook layers that run **without AI** — no tokens, no latency:

| Hook | Trigger | Action |
|---|---|---|
| `PreToolUse` | Before every `octopus_execute_command` | Regex-blocks fatal commands (`rm -rf /`, fork bombs, raw-disk writes, unguarded `DROP TABLE`) |
| `PostToolUse` | After every `octopus_write_file` on JS/TS | Runs `prettier --write` (falls back to `eslint --fix`) |
| `onStop` | End of every task chain | Logs completion; optionally POSTs to `OCTOPUS_WEBHOOK_URL` (Slack/Discord) |

The SecurityReviewer AI agent handles semantic analysis. The hooks handle the obvious fatals that should never cost a token.

### Least-Privilege Permissions

Each agent receives a `Proxy`-wrapped memory object limited to its declared allowlist. Any call outside the allowlist throws `PERMISSION_DENIED` synchronously — no network request is made.

| Agent | Allowed memory methods |
|---|---|
| **Atlas** | `searchStructural`, `getContext`, `structuralImpact` |
| **Forge** | `searchStructural`, `getContext`, `getDecisions`, `getRun`, `writeback`, `saveDecision`, `structuralImpact` |
| **Scribe** | `getContext`, `getDecisions`, `getRun`, `writeback` |
| **SecurityReviewer** | `searchStructural`, `getContext`, `writeback`, `structuralImpact` |
| **MarketScout / Navigator** | `getContext`, `writeback` |

If a hallucinating model generates Scribe code that calls `compactSession`, the Proxy rejects it before the first byte is sent to the memory service.

### OCTOPUS.md Constitution

Drop an `OCTOPUS.md` file in your repository root to establish unbreakable project rules:

```markdown
# OCTOPUS.md
- Never use Moment.js — use date-fns
- All database queries must go through the repository layer, never raw SQL in controllers
- API responses must follow the envelope format: { ok, data, error }
```

During L5 Task Context Profile generation the Python memory service injects the full contents of `OCTOPUS.md` as the **first key** in every agent's context — before structural memory, decisions, or run state. Set `PROJECT_ROOT` in the Python service environment to point to your repo root. The L4 cache key includes an MD5 signature of the file so the cache auto-invalidates whenever the constitution changes.

---

## Setup

### 1 — Python memory service
```bash
cd python
pip install -r requirements.txt
python services/memory_service.py          # port 5000
```

### 2 — Index the repo
```bash
python python/indexer/index_repo.py --root . --db ./data/octopus.db
```

### 3 — Node
```bash
cd node
cp .env.example .env
npm install
```

### 4 — Choose your LLM

**Claude (Anthropic)**
```env
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
```

**GPT-4o (OpenAI)**
```env
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-...
```

**Gemini (Google)**
```env
LLM_PROVIDER=google
GOOGLE_API_KEY=AIza...
```

**Ollama (local — no API key)**
```bash
ollama pull llama3.2        # or llama3.1, qwen2.5, mistral-nemo
```
```env
LLM_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434
LLM_MODEL=llama3.2
```

### 5 — Start

```bash
npm run mcp      # MCP server  (Claude Desktop / Cursor / Windsurf)
npm run serve    # REST API    (port 3001)
npm test         # 63 tests
```

### 6 — Optional: OCTOPUS.md + webhook

```bash
# Project rules — injected into every agent's context
echo "# OCTOPUS.md\n- Never use Moment.js" > OCTOPUS.md
export PROJECT_ROOT=$(pwd)    # tell the Python service where to find it

# Slack/Discord notification when a task chain completes
export OCTOPUS_WEBHOOK_URL=https://hooks.slack.com/services/...
```

---

## 14 Agents

| Agent | Role | Gate |
|---|---|---|
| **Cortex** | LLM-backed planner — picks agents from live registry each task | ✅ |
| **Atlas** | Structural memory search — queries L1 graph before opening files | |
| **Architect** | Boundary impact — assesses what a change touches | |
| **Forge** | Implementation — scopes and drafts code edits | |
| **FactChecker** | Grounding gate — verifies claims against indexed memory | ✅ |
| **Reviewer** | Quality gate | ✅ |
| **SecurityReviewer** | OWASP Top 10 scan — critical findings block release | ✅ |
| **Probe** | Test coverage gate | ✅ |
| **Scribe** | Docs and changelog writer | |
| **ReleaseKeeper** | Final release gate — all approvals required | ✅ |
| **Navigator** | Browser — navigate, snapshot, click, fill (async, non-blocking) | |
| **MarketScout** | Scans GitHub / npm / PyPI for skill opportunities | |
| **Toolsmith** | Synthesises MCP skills from documentation via LLM | |
| **SandboxQA** | Validates skills in isolated Worker threads, self-corrects 3× | ✅ |

**Dynamic agents:** if Cortex selects an agent name that doesn't exist in the registry, the runner auto-synthesises a stub, writes it to disk, and hot-loads it — the chain never crashes on a missing agent.

---

## 20 MCP Tools

### Task Orchestration
| Tool | Description |
|---|---|
| `octopus_plan_task` | Ask Cortex to plan a task into an agent chain |
| `octopus_run_task_chain` | Run the full pipeline end-to-end |

### Memory
| Tool | Description |
|---|---|
| `octopus_search_memory` | Query L1 structural graph |
| `octopus_get_decisions` | Retrieve ADRs from L2 |
| `octopus_compact_session` | Compress session into long-term memory |

### File & Execution
| Tool | Description |
|---|---|
| `octopus_read_file` | Read a workspace file |
| `octopus_write_file` | Write a workspace file (auto-formats JS/TS via PostToolUse hook) |
| `octopus_execute_command` | Run a shell command (PreToolUse hook blocks fatal patterns) |

### Agents & Security
| Tool | Description |
|---|---|
| `octopus_create_agent` | Synthesise and hot-reload a new agent |
| `octopus_scan_security` | OWASP Top 10 static scan |

### LLM
| Tool | Description |
|---|---|
| `octopus_llm_complete` | Prompt the active provider (Anthropic · OpenAI · Google · Ollama) |

### Browser
| Tool | Description |
|---|---|
| `octopus_browser_navigate` | Navigate to a URL and return snapshot |
| `octopus_browser_snapshot` | Capture current accessibility tree |
| `octopus_browser_interact` | Click / fill / eval on active page |

### Skill Marketplace
| Tool | Description |
|---|---|
| `octopus_skill_scout` | Scan GitHub / npm / PyPI for opportunities |
| `octopus_skill_synthesize` | Read docs + synthesise a working MCP skill |
| `octopus_skill_validate` | Run SandboxQA with self-correction |
| `octopus_skill_deploy` | Deploy a QA-passed skill |
| `octopus_skill_retire` | Retire a deprecated skill |
| `octopus_skill_list` | List all skills with status |

---

## Multi-LLM Adapter

```js
const { getTools } = require('./src/adapters');

getTools('anthropic')  // → [{ name, description, input_schema }]
getTools('openai')     // → [{ type:'function', function:{...} }]
getTools('gemini')     // → { function_declarations: [...] }
getTools('ollama')     // → [{ type:'function', function:{...} }]  OpenAI-compatible
getTools('mcp')        // → raw definitions (default)
```

---

## SAFE_MODE

All mutating tools are **disabled by default** (`SAFE_MODE=true`).  
Read-only tools always work:
`octopus_search_memory`, `octopus_scan_security`, `octopus_read_file`,
`octopus_plan_task`, `octopus_skill_list`, `octopus_llm_complete`, `octopus_browser_snapshot`

Set `SAFE_MODE=false` in `.env` to enable the full tool set.

Note: the `PreToolUse` hook applies **even when `SAFE_MODE=false`** — fatal command patterns are unconditionally blocked regardless of mode.

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `LLM_PROVIDER` | `anthropic` | `anthropic` · `openai` · `google` · `ollama` |
| `LLM_MODEL` | provider default | Override the model (e.g. `claude-opus-4-7`) |
| `SAFE_MODE` | `true` | Set `false` to enable mutating tools |
| `MEMORY_SERVICE_URL` | `http://localhost:5000` | Python memory service URL |
| `PROJECT_ROOT` | `.` | Path injected into Python service for OCTOPUS.md lookup |
| `OCTOPUS_WEBHOOK_URL` | — | Slack/Discord incoming webhook for task completion events |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama server URL |

---

## CI / GitHub Actions

Add secrets to your repo (**Settings → Secrets and variables → Actions**):

| Secret | Required for |
|---|---|
| `ANTHROPIC_API_KEY` | Claude (default provider) |
| `OPENAI_API_KEY` | GPT-4o |
| `GOOGLE_API_KEY` | Gemini |
| `GITHUB_TOKEN` | Auto-provided — higher rate limits for MarketScout |

Add variables (**Settings → Secrets and variables → Variables**):

| Variable | Default | Example |
|---|---|---|
| `LLM_PROVIDER` | `anthropic` | `ollama` |
| `LLM_MODEL` | provider default | `llama3.2` |
| `OLLAMA_BASE_URL` | — | `http://your-server:11434` |

---

## REST API

```
GET  /api/agents              List all 14 registered agents
GET  /api/memory/search       Query structural memory
GET  /api/tools/:format       Tools in provider format (anthropic|openai|gemini|ollama|mcp)
POST /api/run                 Run the full agent chain
```

---

## Testing

```bash
cd node && npm test
```

```
Test Suites: 5 passed
Tests:       63 passed
  agents.test.js              — 10 core agents (contract + output)
  agents_marketplace.test.js  — 4 marketplace agents (Navigator, MarketScout, Toolsmith, SandboxQA)
  commands.test.js            — REST API endpoints
  mcp.test.js                 — MCP server + all 20 tools
  memory.test.js              — 5-layer memory bridge
```

---

## Project Structure

```
Octopus-Agent-System/
├── .github/workflows/
│   └── octopus.yml              GitHub Actions CI/CD pipeline
├── node/
│   ├── src/
│   │   ├── agents/              14 specialist agents
│   │   │   └── index.js         Registry with contract validation + hot-reload
│   │   ├── adapters/            LLM format converters (Anthropic, OpenAI, Gemini, Ollama)
│   │   ├── skills/              Shared atomic capabilities
│   │   ├── llm.js               Multi-provider gateway
│   │   ├── mcp.js               MCP stdio server (20 tools, Pre/PostToolUse hooks)
│   │   ├── tools.js             Single source of truth for all tool definitions
│   │   ├── hooks.js             Deterministic hooks — PreToolUse, PostToolUse, onStop
│   │   ├── permissions.js       Least-privilege agent permission matrix
│   │   ├── runner.js            Parallel stage runner with permission proxies
│   │   ├── memory.js            Node ↔ Python memory bridge
│   │   ├── compress.js          Caveman prose compression (~70% token savings)
│   │   ├── errors.js            Canonical error envelopes (GATE_FAILURE, PERMISSION_DENIED, …)
│   │   ├── server.js            REST API server
│   │   └── skill_registry.js   Skill lifecycle (proposed→sandbox→active→deprecated)
│   ├── skills/auto_generated/   LLM-synthesised skills (committed by CI)
│   └── tests/                   63 tests across 5 suites
├── python/
│   ├── memory/
│   │   ├── context_builder.py   L5 profile builder — injects OCTOPUS.md constitution
│   │   └── …                    L1–L4 layers (graph, decisions, run state, cache)
│   ├── indexer/                 Incremental repo indexer
│   └── services/                Flask memory service (port 5000)
├── scripts/
│   ├── octopus_push_handler.js  Push pipeline (task → chain → browse → skills)
│   ├── install-hooks.sh         Git hook installer
│   └── git-hooks/post-commit    Local post-commit hook (background, non-blocking)
├── OCTOPUS.md                   (optional) Developer constitution — injected into all agents
├── frontend/                    Web dashboard
├── install.sh / install.ps1     Universal one-command installer
└── README.md
```

---

## License

Apache 2.0 — see [LICENSE](LICENSE).
