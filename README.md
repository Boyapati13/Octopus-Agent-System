# Octopus Agent System

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)

A **self-evolving** AI agent harness — 14 specialist agents, 20 MCP tools, 5-layer memory,
self-synthesizing skill marketplace, **4-provider LLM gateway** (Claude · GPT-4o · Gemini · Ollama),
browser control, caveman token compression, and a one-command universal installer.

> Octopus discovers new tools, reads their documentation, writes the integration code,
> tests it in an isolated Worker thread, and deploys it — while you sleep.

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
reads the docs, writes a working MCP tool, runs it in an isolated Worker thread with memory
limits, self-corrects up to 3 times on failure, and promotes to production automatically.

### Multi-LLM Gateway

| Provider | Default Model | Tool Use | Notes |
|---|---|---|---|
| `anthropic` | `claude-sonnet-4-6` | ✅ Full | Recommended default |
| `openai` | `gpt-4o` | ✅ Full | Set `OPENAI_API_KEY` |
| `google` | `gemini-2.0-flash` | ✅ Full | Set `GOOGLE_API_KEY` |
| `ollama` | `llama3.2` | ✅ Compatible models | Local, no API key needed |

Switch provider in `.env`:
```bash
LLM_PROVIDER=ollama
LLM_MODEL=llama3.1      # or qwen2.5, mistral-nemo, any tool-capable model
OLLAMA_BASE_URL=http://localhost:11434
```

---

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

### 3 — Node environment
```bash
cd node
cp .env.example .env          # fill in API keys / choose provider
npm install
agent-browser install         # downloads Chrome for Testing (first run only)
```

### 4 — Choose your provider

**Claude (Anthropic)**
```bash
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
```

**GPT-4o (OpenAI)**
```bash
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-...
```

**Gemini (Google)**
```bash
LLM_PROVIDER=google
GOOGLE_API_KEY=AIza...
```

**Ollama (local)**
```bash
# Install Ollama: https://ollama.ai
ollama pull llama3.2          # or llama3.1, qwen2.5, mistral-nemo
LLM_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434
LLM_MODEL=llama3.2
```

### 5 — Start

```bash
# MCP server (connects to Claude Desktop / Cursor / etc.)
npm run mcp

# REST API server
npm run serve

# Run tests
npm test
```

---

## 14 Agents

| Agent | Role | Gate |
|---|---|---|
| **Cortex** | Planner — picks the exact agents each task needs | ✅ |
| **Atlas** | Memory search — queries L1 graph before opening files | |
| **Architect** | Boundary impact — assesses what changes touch | |
| **Forge** | Implementation — scopes and drafts edits | |
| **FactChecker** | Grounding gate — verifies claims against indexed memory | ✅ |
| **Reviewer** | Quality gate — approves or blocks | ✅ |
| **SecurityReviewer** | OWASP Top 10 scan — critical findings block release | ✅ |
| **Probe** | Test coverage gate | ✅ |
| **Scribe** | Docs and changelog writer | |
| **ReleaseKeeper** | Final release gate — all approvals must be present | ✅ |
| **Navigator** | Browser agent — navigate, snapshot, click, fill | |
| **MarketScout** | Scans GitHub, npm, PyPI for new skill opportunities | |
| **Toolsmith** | Synthesizes MCP skills from documentation via LLM | |
| **SandboxQA** | Validates skills in isolated Worker threads, self-corrects | ✅ |

---

## 20 MCP Tools

### Task Orchestration
| Tool | Description |
|---|---|
| `octopus_plan_task` | Ask Cortex to plan a task into an agent execution chain |
| `octopus_run_task_chain` | Run the full Cortex → agents → gates → compact pipeline |

### Memory
| Tool | Description |
|---|---|
| `octopus_search_memory` | Query L1 structural graph (files, symbols, architecture) |
| `octopus_get_decisions` | Retrieve past ADRs and risk flags from L2 |
| `octopus_compact_session` | Compress session into long-term memory |

### File & Execution
| Tool | Description |
|---|---|
| `octopus_read_file` | Read a file from the workspace |
| `octopus_write_file` | Write a file to the workspace |
| `octopus_execute_command` | Run a shell command in the workspace |

### Agents & Security
| Tool | Description |
|---|---|
| `octopus_create_agent` | Dynamically synthesize and hot-reload a new agent |
| `octopus_scan_security` | OWASP Top 10 static scan on file paths |

### LLM
| Tool | Description |
|---|---|
| `octopus_llm_complete` | Send a prompt to the active provider and return the completion |

### Browser
| Tool | Description |
|---|---|
| `octopus_browser_navigate` | Navigate to a URL and return a page snapshot |
| `octopus_browser_snapshot` | Capture the current accessibility tree |
| `octopus_browser_interact` | Click, fill, type, or eval on the active page |

### Skill Marketplace
| Tool | Description |
|---|---|
| `octopus_skill_scout` | Scan GitHub/npm/PyPI for skill opportunities |
| `octopus_skill_synthesize` | Read docs + synthesize a working MCP skill |
| `octopus_skill_validate` | Run SandboxQA (with self-correction) on a skill |
| `octopus_skill_deploy` | Deploy a QA-passed skill to the active registry |
| `octopus_skill_retire` | Retire a deprecated skill |
| `octopus_skill_list` | List all skills with status and QA results |

---

## SAFE_MODE

All mutating tools are disabled by default (`SAFE_MODE=true`). Read-only tools
(`octopus_search_memory`, `octopus_scan_security`, `octopus_read_file`, `octopus_plan_task`,
`octopus_skill_list`, `octopus_llm_complete`, `octopus_browser_snapshot`) always work.

Set `SAFE_MODE=false` in `.env` to enable the full tool set.

---

## LLM Adapter Formats

```js
const { getTools } = require('./src/adapters');

getTools('anthropic')  // → [{ name, description, input_schema }]
getTools('openai')     // → [{ type:'function', function:{name, description, parameters} }]
getTools('gemini')     // → { function_declarations: [...] }
getTools('ollama')     // → [{ type:'function', function:{...} }]  (OpenAI-compatible)
getTools('mcp')        // → raw tool definitions (default)
```

---

## REST API

```
GET  /api/agents          List all registered agents
GET  /api/memory/search   Query structural memory
GET  /api/tools/:format   Get tools in provider format (anthropic|openai|gemini|ollama|mcp)
POST /api/run             Run the full agent chain
```

---

## Project Structure

```
Octopus-Agent-System/
├── node/
│   ├── src/
│   │   ├── agents/          14 specialist agents
│   │   ├── adapters/        LLM format converters (Anthropic, OpenAI, Gemini, Ollama)
│   │   ├── skills/          Shared atomic capabilities
│   │   ├── llm.js           Multi-provider gateway
│   │   ├── mcp.js           MCP stdio server (20 tools)
│   │   ├── tools.js         Single source of truth for all tool definitions
│   │   ├── memory.js        Node ↔ Python memory bridge
│   │   ├── compress.js      Caveman prose compression (~70% token savings on prose)
│   │   ├── runner.js        Dynamic task orchestrator
│   │   ├── server.js        REST API server
│   │   └── skill_registry.js  Skill lifecycle (proposed→sandbox→active→deprecated)
│   ├── skills/auto_generated/  LLM-synthesized skills (hot-deployed)
│   └── tests/
├── python/
│   ├── memory/              5-layer memory implementation (SQLite + NetworkX)
│   ├── indexer/             Incremental repo indexer
│   └── services/            Flask memory service
├── frontend/                Web dashboard
├── install.sh / install.ps1 Universal one-command installer
└── SKILL.md                 Guide for writing new skills
```

---

## License

Apache 2.0 — see [LICENSE](LICENSE).
