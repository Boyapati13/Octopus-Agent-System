<p align="center">
  <img src="docs/media/agentdeck-icon.png" width="150" alt="OctoDeck — octopus agent system with physical control surface">
</p>

<h1 align="center">🐙 Octopus Agent System</h1>
<h3 align="center">OctoDeck Edition — v3.0</h3>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache%202.0-blue.svg"></a>
  <img src="https://img.shields.io/badge/version-3.0.0-brightgreen.svg">
  <img src="https://img.shields.io/badge/agents-14%20specialist-blue.svg">
  <img src="https://img.shields.io/badge/MCP%20tools-26-orange.svg">
  <img src="https://img.shields.io/badge/AgentShield-102%20rules-red.svg">
  <img src="https://img.shields.io/badge/tests-141%20passing-brightgreen.svg">
  <img src="https://img.shields.io/badge/surfaces-13%20displays-purple.svg">
</p>

<p align="center">
  <img src="https://img.shields.io/badge/node-%3E%3D18-green.svg">
  <img src="https://img.shields.io/badge/python-%3E%3D3.11-yellow.svg">
  <img src="https://img.shields.io/badge/LLM-Claude%20%7C%20GPT--4o%20%7C%20Gemini%20%7C%20Ollama%20%7C%20JAX%2FGemma-blueviolet.svg">
  <img src="https://img.shields.io/badge/MCP-stdio%20server-black.svg">
  <img src="https://img.shields.io/badge/Stream%20Deck%2B-8%20keys%20%2B%204%20encoders-black.svg?logo=elgato">
</p>

---

> **A self-evolving, continuously-learning multi-agent AI orchestration system — with a physical 13-surface control dashboard, live web UI, voice input, and a JAX/Gemma custom backend.**

---

## Install — one command

```powershell
# Windows — PowerShell (also works from GitHub raw URL)
.\install.ps1

# Remote one-liner:
powershell -ExecutionPolicy Bypass -Command "iex (irm https://raw.githubusercontent.com/Boyapati13/Octopus-Agent-System/master/install.ps1)"
```

```bash
# Mac / Linux
./install.sh
```

The installer:
- Checks Node.js ≥ 18 and Python ≥ 3.11
- Installs all npm + pip dependencies
- Creates `node/.env` auto-configured for Ollama if detected, else Anthropic
- Registers the MCP server with Claude Desktop, Claude Code, Cursor, Windsurf, Continue
- Links the `octopus` CLI globally

---

## Start

```powershell
# Start REST API + WebSocket + memory service + open dashboard
.\start_server.ps1

# Start MCP stdio server only (for Claude Desktop / Cursor)
.\start_mcp.ps1
```

After `start_server.ps1` starts, open: **http://localhost:3001/dashboard**

---

## Table of Contents

- [What's New in v3.0](#whats-new-in-v30)
- [Architecture](#architecture)
- [Quick Start](#quick-start)
- [Web Dashboard](#web-dashboard)
- [Octopus Agent System](#octopus-agent-system)
  - [14 Specialist Agents](#14-specialist-agents)
  - [Cortex Planning Patterns](#cortex-planning-patterns)
  - [5-Layer Memory](#5-layer-memory)
  - [AgentShield Security](#agentshield-security)
  - [26 MCP Tools](#mcp-tool-catalogue--26-tools)
- [OctoDeck Control Surface](#octodeck-control-surface)
- [Configuration](#configuration)
- [Headless Mode](#headless-mode)
- [Voice Input](#voice-input)
- [LLM Providers](#llm-providers)
- [Tool Plugins](#tool-plugins)
- [Testing](#testing)
- [Development](#development)
- [Uninstall](#uninstall)
- [Roadmap](#roadmap)
- [Attribution](#attribution)

---

## What's New in v3.0

### OctoDeck Fusion
- **AgentDeck integration** — every Octopus agent chain visible and controllable across 13 surfaces
- **OctopusAdapter** — PLAN / RUN / STOP / SHIELD controls on Stream Deck+
- **APME → Instincts loop** — AgentDeck session evaluations auto-generate instinct candidates
- **OctopusDeckLayout** — 8 dedicated keys + 4 encoder wheels

### Web Dashboard (new)
- **No hardware needed** — `GET /dashboard` at `http://localhost:3001/dashboard`
- Calm workspace focused on answer + conversation, with secondary details in a collapsible drawer
- Voice output for final answers (browser TTS via `speechSynthesis`) on task completion events
- Lightweight event/detail panel for session visibility without monitoring-console clutter
- Auto-reconnect with exponential backoff

### Project Workspace (updated)
- `GET /api/projects` — list, create, and switch project/session workspaces
- `POST /api/projects/:id/messages` — persist conversation messages by project
- `POST /api/projects/:id/activity` — keep execution events separate from chat
- `POST /api/projects/:id/answer` and `PATCH /api/projects/:id/browser-context` — keep the visible operator state in sync
- `POST /api/tasks/run` and `POST /api/tasks/voice` accept `project_id` so execution stays scoped to the active workspace

### Voice Integration (new)
- **POST /api/tasks/voice** — text-in / TTS-summary-out path
- `OctopusAdapter.supportsVoiceInput = true` — voice-tagged prompts route to voice endpoint
- End-to-end flow: wake word → ASR → AgentDeck → Octopus → `voice_summary` WS event → TTS
- See [docs/quickstart-voice.md](docs/quickstart-voice.md)

### Headless Mode (new)
- `HEADLESS_MODE=true` — external LLM (Claude Desktop, Cursor) is the planner
- Octopus becomes the tool/safety layer; AgentShield and all gates remain active
- Toggle at runtime: `/headless on` in the CLI
- See [docs/quickstart-headless.md](docs/quickstart-headless.md)

### JAX/Gemma Custom Backend (new)
- `LLM_PROVIDER=custom_http` — any OpenAI-compatible server
- Reference FastAPI server in `examples/jax-gemma-http/`
- Works with vLLM, LM Studio, llamafile, text-generation-webui
- See [docs/quickstart-jax-gemma.md](docs/quickstart-jax-gemma.md)

### Tool Plugin System (new)
- `tools/<name>/tool.json` + `tools/<name>/index.js` — auto-loaded on startup
- `GET /api/plugins` · `POST /api/plugins/call/:name` · `octopus_plugin_call` MCP tool
- Built-in plugins: `hello_world` (example), `http_fetch` (SSRF-guarded safe fetch)
- See [tools/README.md](tools/README.md)

### Jarvis CLI (upgraded)
- `/provider list` · `/provider set <p> [model]` — switch LLM without editing .env
- `/headless on|off` — toggle headless mode
- `/dashboard` — open web UI in browser
- All changes written to `.env` instantly

### Octopus v2.0 (included)
- ~75% QA speedup via parallel `Promise.allSettled` gates
- ~60% token cost reduction via `MAX_THINKING_TOKENS` + Strategic Compaction
- 102-rule AgentShield scanner
- Continuous Learning v2 (Instincts)
- 4-tier Zero-Key cascade (OS Vault → CLI Session → env → .env)

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                   Octopus Agent System — OctoDeck Edition            │
│                                                                      │
│  ┌──────────────────────┐    ┌─────────────────────────────────────┐ │
│  │   node/src/          │    │       bridge/ (AgentDeck)           │ │
│  │                      │◄───│  OctopusAdapter   WebSocket client  │ │
│  │  Cortex (planner)    │    │  OctopusDeckLayout 8 keys+4 encoders│ │
│  │  14 specialist agents│    │  ApmOctopusBridge  APME→Instincts   │ │
│  │  REST API  :3001     │    └───────────────┬─────────────────────┘ │
│  │  WS  ws://:3001/ws   │    ┌───────────────▼─────────────────────┐ │
│  │  Dashboard /dashboard│    │    13 Display Surfaces               │ │
│  │  AgentShield 102✓    │    │  Stream Deck+  TUI  Android  Apple  │ │
│  │  Instincts (learn)   │    │  ESP32  Pixoo64  Web Dashboard       │ │
│  │  Tool plugins        │    └─────────────────────────────────────┘ │
│  │  MCP stdio  26 tools │    ┌─────────────────────────────────────┐ │
│  └──────────────────────┘◄───►   python/ (Flask :5000)             │ │
│                               │  L1 graph · L2 ADRs · L3 sessions  │ │
│  LLM Gateway:                 │  Instincts · Context Builder        │ │
│  Anthropic · OpenAI · Google  └─────────────────────────────────────┘ │
│  Ollama · NVIDIA · HuggingFace                                       │
│  custom_http (JAX/Gemma, vLLM, LM Studio, llamafile)                 │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Quick Start

### Option A — Local only (no hardware, no API key)

```bash
git clone https://github.com/Boyapati13/Octopus-Agent-System.git
cd Octopus-Agent-System

# Install Ollama: https://ollama.ai
ollama pull gemma4:e2b          # 7.2 GB — fast, no API key needed

# Install + start
.\install.ps1                   # Windows
./install.sh                    # Mac/Linux
.\start_server.ps1              # starts everything + opens dashboard
```

→ Dashboard opens at **http://localhost:3001/dashboard**

See [docs/quickstart-local.md](docs/quickstart-local.md) for full steps.

### Option B — Full OctoDeck (Octopus + 13 surfaces + Stream Deck+)

```bash
# Terminal 1 — Octopus backend
.\start_server.ps1

# Terminal 2 — AgentDeck bridge + surfaces
agentdeck octopus
```

### Option C — Headless (Claude Desktop as planner, Octopus as tools)

```json
{
  "mcpServers": {
    "octopus": {
      "command": "node",
      "args": ["/path/to/octopus/node/src/mcp.js"],
      "env": { "HEADLESS_MODE": "true", "SAFE_MODE": "false" }
    }
  }
}
```

See [docs/quickstart-headless.md](docs/quickstart-headless.md).

### Option D — JAX/Gemma custom backend

```bash
cd examples/jax-gemma-http
pip install -r requirements.txt
python server.py --model google/gemma-3-4b-it --port 8080
```

`node/.env`:
```env
LLM_PROVIDER=custom_http
CUSTOM_HTTP_URL=http://localhost:8080
CUSTOM_HTTP_MODEL=google/gemma-3-4b-it
```

See [docs/quickstart-jax-gemma.md](docs/quickstart-jax-gemma.md).

---

## Web Dashboard

No Stream Deck+ needed. After `.\start_server.ps1`, open:

**http://localhost:3001/dashboard**

Features:
- **Focused main view** — answer area + conversation are primary, with reduced UI noise
- **Details drawer** — browser/session event context lives in a right-side collapsible panel
- **Voice answers** — when a `chain_done` event is received, the final answer is spoken aloud
- **Voice input ready** — browser ASR path can trigger voice task submission
- **Clean status surface** — simplified status and event visibility for day-to-day use
- **WebSocket auto-reconnect** with exponential backoff
- Runs directly in the browser with no Stream Deck dependency

```
http://localhost:3001/dashboard   ← operator workspace
http://localhost:3001/api/status  ← JSON status (for monitoring)
ws://localhost:3001/ws            ← raw WebSocket event stream
```

---

## Octopus Agent System

### 14 Specialist Agents

| Agent | Role | Gate | Description |
|---|---|---|---|
| **Cortex** | Planner | ✅ | LLM-driven task decomposition; TDD / security / research routing |
| **Atlas** | Memory | | L1 structural graph search |
| **Architect** | Design | | Boundary impact analysis |
| **Forge** | Implementation | | Scoped edit plans, instinct-aware |
| **FactChecker** | Grounding | ✅ | Parallel QA gate — catches hallucinations |
| **Reviewer** | Quality | ✅ | Parallel QA gate — code quality |
| **SecurityReviewer** | Security | ✅ | OWASP Top 10 + 3-layer AgentShield |
| **Probe** | Testing | ✅ | Parallel QA gate — 80% coverage minimum |
| **Scribe** | Docs | | Documentation, changelog, ADR generation |
| **ReleaseKeeper** | Release | ✅ | Final gate before any release |
| **Navigator** | Browser | | `navigate` / `snapshot` / `interact` |
| **MarketScout** | Skills | | ECC library → npm → PyPI → GitHub |
| **Toolsmith** | Synthesis | | LLM-generates novel skills |
| **SandboxQA** | Validation | ✅ | Isolated skill validation, 3× self-correct |

### Cortex Planning Patterns

```
Default:         Atlas → Architect → Forge → [Reviewer ‖ SecurityReviewer ‖ Probe ‖ FactChecker] → Scribe → ReleaseKeeper
TDD-first:       Atlas → Probe → Forge → [QA gates] → Scribe
Security-first:  Atlas → SecurityReviewer → Forge → [QA gates] → Scribe
Research-first:  Atlas → FactChecker → Architect → Forge → [QA gates] → Scribe
```

The `[QA gates]` stage runs **in parallel** via `Promise.allSettled` (~75% faster).

### 5-Layer Memory

```
L5  Task Context Profile  — ephemeral, per-agent call
L4  Prompt Cache          — Redis / in-memory fallback
L3  Run State             — SQLite, session-scoped
L2  Decision Memory       — SQLite append-only (ADRs)
L1  Structural Memory     — SQLite + NetworkX graph
```

### AgentShield — 3 Layers

| Layer | Component | Cost | What it catches |
|---|---|---|---|
| 1 | PreToolUse hook | Zero tokens | `rm -rf`, `DROP DATABASE`, fork bombs |
| 2 | SecurityReviewer | LLM call | OWASP Top 10, secrets, injections |
| 3 | AgentShield gate | Zero tokens | 102-rule static scanner |

### MCP Tool Catalogue — 26 Tools

| Category | Tool |
|---|---|
| Orchestration | `octopus_plan_task` · `octopus_run_task_chain` |
| Memory | `octopus_search_memory` · `octopus_get_decisions` · `octopus_compact_session` |
| Files | `octopus_read_file` · `octopus_write_file` · `octopus_execute_command` |
| Agents | `octopus_create_agent` · `octopus_scan_security` |
| LLM | `octopus_llm_complete` |
| Browser | `octopus_browser_navigate` · `octopus_browser_snapshot` · `octopus_browser_interact` |
| Skills | `octopus_skill_scout` · `octopus_skill_synthesize` · `octopus_skill_validate` · `octopus_skill_deploy` · `octopus_skill_retire` · `octopus_skill_list` |
| Auth | `octopus_login` · `octopus_vault_check` |
| Diagnostics | `octopus_memory_status` · `octopus_task_routes` |
| Plugins | `octopus_plugin_list` · `octopus_plugin_call` |

---

## OctoDeck Control Surface

### Stream Deck+ Layout

```
┌─────────┬─────────┬─────────┬─────────┐
│  PLAN   │   RUN   │  STOP   │ AGENTS  │
│ Blue    │ Amber   │ Red     │ Green   │
├─────────┼─────────┼─────────┼─────────┤
│SECURITY │ MEMORY  │INSTINCT │ SHIELD  │
│ Orange  │ Blue    │ Purple  │ Red     │
└─────────┴─────────┴─────────┴─────────┘

LCD Touch Strip — 4 Encoder Wheels:
  E1  Task Prompt   rotate=scroll history  press=send to Octopus
  E2  Agent Focus   rotate=cycle agents    press=view agent details
  E3  Memory Query  rotate=browse context  press=L1 search
  E4  LLM Provider  rotate=switch provider (Claude / GPT-4o / Gemini / Ollama)
```

### 13 Display Surfaces

Stream Deck+ · Ulanzi D200H · Android tablet · Android e-ink · iOS/iPadOS · macOS SwiftUI · TUI terminal · ESP32 AMOLED · ESP32 IPS · Ulanzi TC001 LED · Pixoo64 LED matrix · iTerm2 badges · Wake word / voice

---

## Configuration

### `node/.env` key variables

| Variable | Default | Description |
|---|---|---|
| `LLM_PROVIDER` | `anthropic` | `anthropic` · `openai` · `google` · `ollama` · `nvidia` · `huggingface` · `custom_http` · `router` |
| `LLM_MODEL` | provider default | Override model |
| `HEADLESS_MODE` | `false` | `true` = external LLM is planner |
| `SAFE_MODE` | `true` | `false` to enable file writes + shell commands |
| `AGENTSHIELD_MODE` | `advisory` | `none` · `advisory` · `gate` (blocking) |
| `SOVEREIGN_FALLBACK_MODEL` | `gemma4:e2b` | Local fallback when cloud key missing |
| `CUSTOM_HTTP_URL` | — | Base URL for `LLM_PROVIDER=custom_http` |
| `CUSTOM_HTTP_MODEL` | — | Model name for custom HTTP backend |
| `MAX_THINKING_TOKENS` | `10000` | Token cap per LLM call |
| `MEMORY_SERVICE_URL` | `http://localhost:5000` | Python memory service |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama server |

---

## Headless Mode

External LLM as planner, Octopus as tools:

```env
HEADLESS_MODE=true
SAFE_MODE=false
```

Toggle at runtime:
```
❯ /headless on
❯ /headless off
```

Claude Desktop `claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "octopus": {
      "command": "node",
      "args": ["/path/to/octopus/node/src/mcp.js"],
      "env": { "HEADLESS_MODE": "true", "SAFE_MODE": "false" }
    }
  }
}
```

Full guide: [docs/quickstart-headless.md](docs/quickstart-headless.md)

---

## Voice Input

```
Wake word / push-to-talk → ASR → AgentDeck → OctopusAdapter
  → POST /api/tasks/voice { text }
  → Chain runs
  → WS event: voice_summary { summary, success }
  → TTS: speak summary
```

```bash
# Test without hardware
curl -X POST http://localhost:3001/api/tasks/voice \
  -H "Content-Type: application/json" \
  -d '{"text": "summarize the last architectural decision"}'
```

Full guide: [docs/quickstart-voice.md](docs/quickstart-voice.md)

---

## LLM Providers

| Provider | Setting | Models | Key |
|---|---|---|---|
| Anthropic Claude | `anthropic` | claude-sonnet-4-6, claude-opus-4-7, claude-haiku-4-5 | `ANTHROPIC_API_KEY` |
| OpenAI | `openai` | gpt-4o, gpt-4o-mini | `OPENAI_API_KEY` |
| Google Gemini | `google` | gemini-2.0-flash, gemini-2.5-pro | `GOOGLE_API_KEY` |
| Ollama (local) | `ollama` | gemma4:e2b, gemma4:26b, gemma4:31b, gemma3:27b | None |
| NVIDIA NIM | `nvidia` | meta/llama-3.1-405b-instruct, kimi-k2, deepseek-v4-pro | `NVIDIA_API_KEY` (free) |
| HuggingFace | `huggingface` | google/gemma-3-4b-it, gemma-3-27b-it | `HF_TOKEN` (free) |
| Custom HTTP | `custom_http` | any | `CUSTOM_HTTP_URL` |
| Smart Router | `router` | best per agent role | varies |

**Sovereign Fallback:** when the selected cloud provider has no key, Octopus automatically routes to local Ollama (`SOVEREIGN_FALLBACK_MODEL`, default `gemma4:e2b`) and logs the reason clearly.

### Gemma 4 (recommended for local)

```bash
ollama pull gemma4:e2b    # 7.2 GB — default, native function-calling + audio
ollama pull gemma4:26b    # 18 GB  — MoE, fast planning, 256K context
ollama pull gemma4:31b    # 20 GB  — best local quality, 85.2% MMLU Pro
```

### JAX/Gemma backend

```bash
cd examples/jax-gemma-http
pip install -r requirements.txt
python server.py --model google/gemma-3-4b-it
```

```env
LLM_PROVIDER=custom_http
CUSTOM_HTTP_URL=http://localhost:8080
CUSTOM_HTTP_MODEL=google/gemma-3-4b-it
```

Also works with: vLLM, LM Studio, llamafile, text-generation-webui (any OpenAI-compatible server).

---

## Tool Plugins

Add custom tools without modifying core code:

```
tools/
  my-tool/
    tool.json    ← manifest (name, description, schema, safety_tier)
    index.js     ← handler: module.exports = async (input) => result
```

```bash
# After adding a plugin, restart the server — it auto-loads
GET  /api/plugins             # list all plugins
POST /api/plugins/call/:name  # call a plugin
# Also available as MCP tools: octopus_plugin_list, octopus_plugin_call
```

Built-in: `hello_world` (example), `http_fetch` (SSRF-guarded). See [tools/README.md](tools/README.md).

---

## Testing

### Currently passing — 141 tests total

```bash
# Node.js — Jest (100 tests)
cd node && npm test
```
```
Test Suites: 8 passed, 8 total
Tests: 100 passed

  agents.test.js          32   14 agent contracts + SecurityReviewer + ReleaseKeeper
  agents_marketplace.test.js 16  Navigator · MarketScout · Toolsmith · SandboxQA
  commands.test.js         6   REST API: health · agents · onboard · plan · run · 404
  mcp.test.js              6   MCP server: 26 tools · SAFE_MODE guards · concurrent calls
  memory.test.js           3   5-layer memory bridge
  vault_fallback.test.js   9   Zero-Key cascade · Ollama routing · Sovereign Fallback
  octodeck.test.js        15   AgentDeck API: tasks/plan · tasks/run · tasks/interrupt
                               memory/search · security/scan · voice · status · plugins
  phase2to6.test.js       13   Dashboard · HEADLESS_MODE · custom_http · tool plugins · 404
```

```bash
# Python — pytest (41 tests)
py -m pytest python/tests/ -q          # Windows
python3 -m pytest python/tests/ -q    # Mac/Linux
```
```
41 passed in ~22s
  test_graph_store.py     11   node upsert · edge queries · relevance scoring
  test_indexer.py         13   symbol extraction · incremental indexer
  test_memory_service.py   9   health · search · decisions · compact · context
  test_schema.py           8   decision CRUD · run state · upsert semantics
```

> **Expected console output during Node tests (not failures):**
> `[cortex] LLM planning failed — using keyword fallback` — no real LLM in tests.
> `AgentShield scan skipped — hook guard active` — deduplication guard fires correctly.

---

## Development

```bash
# Start the REST+WS server + memory service
.\start_server.ps1         # Windows
./start_mcp.sh             # Mac/Linux (starts MCP + memory)

# CLI
node node/src/cli.js
❯ /plan add authentication         # plan only
❯ /run  add authentication         # full chain
❯ /provider set ollama gemma4:e2b  # switch model
❯ /headless on                     # toggle headless
❯ /dashboard                       # open web UI
❯ /vault                           # check API keys

# Build bridge TypeScript (optional — for AgentDeck integration)
cd bridge && npm install && npm run build

# Tests
cd node && npm test
py -m pytest python/tests/ -q
```

### Adding a new agent

1. `node/src/agents/yourAgent.js` — follow existing pattern
2. Register in `node/src/agents/index.js`
3. Optionally add a key in `bridge/src/octopus/octopus-deck-layout.ts`
4. Add tests in `node/tests/agents.test.js`

### Adding a tool plugin

1. Create `tools/<name>/tool.json` + `tools/<name>/index.js`
2. Restart the server — it auto-loads
3. See [tools/README.md](tools/README.md)

---

## Uninstall

### Quick uninstall (keep repo, remove registrations + global CLI)

```powershell
# Windows PowerShell
$RepoDir = "C:\path\to\Octopus-Agent-System"   # ← your clone path

# 1. Remove global CLI link
Push-Location "$RepoDir\node"; npm unlink --silent; Pop-Location

# 2. Remove from PATH (user-level)
$p = [System.Environment]::GetEnvironmentVariable('PATH','User')
$p = ($p -split ';' | Where-Object { $_ -ne $RepoDir }) -join ';'
[System.Environment]::SetEnvironmentVariable('PATH', $p, 'User')

# 3. Remove MCP registration from Claude Desktop
$cfg = "$env:APPDATA\Claude\claude_desktop_config.json"
if (Test-Path $cfg) {
    $j = Get-Content $cfg -Raw | ConvertFrom-Json
    $j.mcpServers.PSObject.Properties.Remove('octopus')
    $j | ConvertTo-Json -Depth 10 | Out-File $cfg -Encoding utf8
    Write-Host "Removed from Claude Desktop"
}

# 4. Remove from Cursor
$cfg = "$env:APPDATA\Cursor\User\globalStorage\mcp.json"
if (Test-Path $cfg) {
    $j = Get-Content $cfg -Raw | ConvertFrom-Json
    $j.mcpServers.PSObject.Properties.Remove('octopus')
    $j | ConvertTo-Json -Depth 10 | Out-File $cfg -Encoding utf8
    Write-Host "Removed from Cursor"
}

# 5. Remove API keys from OS Vault (Windows Credential Manager)
$providers = @('anthropic','openai','google','nvidia','huggingface')
foreach ($p in $providers) {
    try {
        [Windows.Security.Credentials.PasswordVault,Windows.Security.Credentials,ContentType=WindowsRuntime] | Out-Null
        $vault = New-Object Windows.Security.Credentials.PasswordVault
        $cred = $vault.Retrieve("Octopus_Vault", $p)
        $vault.Remove($cred)
        Write-Host "Removed $p key from Vault"
    } catch { /* not present */ }
}

Write-Host "Uninstall complete. Delete the repo folder to remove all files."
```

### Mac/Linux

```bash
# Remove global CLI link
cd /path/to/Octopus-Agent-System/node && npm unlink

# Remove MCP registration from Claude Desktop
python3 - <<'EOF'
import json, os
cfg = os.path.expanduser("~/.config/Claude/claude_desktop_config.json")
if os.path.exists(cfg):
    data = json.load(open(cfg))
    data.get("mcpServers", {}).pop("octopus", None)
    json.dump(data, open(cfg, "w"), indent=2)
    print("Removed from Claude Desktop")
EOF

# Remove API keys from macOS Keychain
security delete-generic-password -s "Octopus_Vault" -a anthropic 2>/dev/null
security delete-generic-password -s "Octopus_Vault" -a openai    2>/dev/null
security delete-generic-password -s "Octopus_Vault" -a google    2>/dev/null
security delete-generic-password -s "Octopus_Vault" -a nvidia    2>/dev/null

# Delete the repo
rm -rf /path/to/Octopus-Agent-System
echo "Uninstall complete."
```

### What gets removed / left behind

| Component | Uninstall removes? | Notes |
|---|---|---|
| `node_modules/` | No (in repo dir) | Delete repo folder to clean |
| `node/.env` | No | Contains your local config |
| `data/octopus.db` | No | Your agent memory (L1–L3) |
| `octopus` CLI command | ✅ `npm unlink` | Removed from PATH |
| MCP server entry | ✅ (see above) | Removed from each client |
| OS Vault keys | ✅ (see above) | Wiped from Windows CM / macOS Keychain |
| Python packages | No | `pip uninstall` manually if needed |

> **To fully remove everything:** unregister (steps above), then delete the repo folder.
> Your `.env` and `data/` directory with learned memory will be gone.

---

## Functions Reference

### REST API — full endpoint list

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/health` | — | Server + chain status + cache stats |
| GET | `/api/status` | — | Chain state, LLM provider, headless mode |
| GET | `/api/agents` | — | List all 14 registered agents |
| POST | `/api/tasks/plan` | — | Run Cortex; return planned agent chain |
| POST | `/api/tasks/run` | — | Start full chain (events on WS `/ws`) |
| POST | `/api/tasks/interrupt` | — | Stop the running chain |
| POST | `/api/tasks/voice` | — | Voice path; emits `voice_summary` on WS |
| POST | `/api/security/scan` | — | AgentShield scan: `{ target: "file or code" }` |
| GET | `/api/memory/search?q=` | — | L1 structural memory search |
| GET | `/api/memory/structural?q=` | — | Same (legacy alias) |
| GET | `/api/memory/decisions` | — | L2 ADR log |
| GET | `/api/memory/run` | — | Current run state |
| POST | `/api/memory/compact` | — | Compact session to long-term memory |
| GET | `/api/llm/provider` | — | Active LLM provider + model |
| POST | `/api/llm/complete` | — | Direct LLM completion |
| GET | `/api/tools/:format` | — | Tool declarations: `anthropic` `openai` `gemini` `mcp` |
| GET | `/api/plugins` | — | List loaded tool plugins |
| POST | `/api/plugins/call/:name` | — | Call a named tool plugin |
| GET | `/api/skills` | — | Skill registry |
| GET | `/dashboard` | — | Web dashboard (HTML) |
| GET | `/` | — | Redirects to `/dashboard` |
| WS | `/ws` | — | WebSocket event stream |

### WebSocket events

| Event | Payload | Fired when |
|---|---|---|
| `connected` | `{}` | WS connection opens |
| `chain_start` | `{ task, plan: string[] }` | Chain begins |
| `agent_start` | `{ agent, role }` | Agent spawned |
| `agent_done` | `{ agent, approved, notes }` | Agent finished |
| `gate_fail` | `{ agent, reason }` | Gate blocked the chain |
| `chain_done` | `{ task, success, duration_ms }` | Chain complete |
| `tool_call` | `{ tool, args }` | Tool called inside agent |
| `compaction` | `{ session_tool_calls }` | Context compaction suggested |
| `instinct_new` | `{ id, pattern, confidence, occurrences }` | Instinct learned |
| `voice_summary` | `{ summary, success }` | Voice task TTS result |
| `disconnected` | `{}` | WS connection closed |

### MCP Tools (26) — grouped

**Orchestration:** `octopus_plan_task` · `octopus_run_task_chain`

**Memory:** `octopus_search_memory` · `octopus_get_decisions` · `octopus_compact_session`

**Files & Shell:** `octopus_read_file` · `octopus_write_file` · `octopus_execute_command`

**Agents & Security:** `octopus_create_agent` · `octopus_scan_security`

**LLM:** `octopus_llm_complete`

**Browser:** `octopus_browser_navigate` · `octopus_browser_snapshot` · `octopus_browser_interact`

**Skills:** `octopus_skill_scout` · `octopus_skill_synthesize` · `octopus_skill_validate` · `octopus_skill_deploy` · `octopus_skill_retire` · `octopus_skill_list`

**Auth + Diagnostics:** `octopus_login` · `octopus_vault_check` · `octopus_memory_status` · `octopus_task_routes`

**Plugins:** `octopus_plugin_list` · `octopus_plugin_call`

### CLI commands

```
/plan <task>           Cortex plans — shows agent chain, does not run
/run  <task>           Full 14-agent pipeline with live output
/agents                List all agents with roles + gate flag
/models                Installed Ollama models
/routes                Smart Task Router — which model per agent
/provider              Show active provider/model
/provider list         All providers + key status
/provider set <p> [m]  Switch provider (writes to .env)
/headless              Show current HEADLESS_MODE
/headless on|off       Toggle headless mode (writes to .env)
/vault                 Check OS Vault key status (all providers)
/status                Health check: memory, Ollama, provider
/dashboard             Open web UI in browser
/update                Check GitHub for updates + apply
/update-models         Re-pull all Ollama models
/help                  Full command reference
/exit                  Quit
```

Plain text (no slash) = run a task immediately.

### Python memory service endpoints (:5000)

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Service health |
| GET | `/context/<agent>` | L5 context assembly for an agent |
| GET | `/structural/search?q=` | L1 graph search |
| POST | `/structural/impact` | Boundary impact analysis |
| GET | `/decisions` | L2 ADR log |
| POST | `/decisions` | Save an ADR |
| GET | `/run` | Current run state |
| POST | `/run` | Save run state |
| POST | `/run/compact` | Compact session |
| POST | `/writeback` | Agent findings → memory |
| GET | `/instincts` | List instincts |
| POST | `/instincts` | Save an instinct |
| PATCH | `/instincts/<id>/evolve` | Elevate instinct to skill |

---

## Roadmap

- [ ] Voice → Octopus via offline wake word (Porcupine / microWakeWord on ESP32)
- [ ] Multi-chain view — parallel chains on separate Stream Deck key rows
- [ ] Ollama model hot-swap via E4 encoder without restart
- [ ] TUI agent swimlane — one row per agent, live token counters
- [ ] AgentShield findings pushed to Apple/Android notification surfaces
- [ ] Instinct confidence bar on Pixoo64 LED rows

---

## Documentation

| Doc | Content |
|---|---|
| [docs/quickstart-local.md](docs/quickstart-local.md) | No hardware, no API key — run in 5 minutes |
| [docs/quickstart-headless.md](docs/quickstart-headless.md) | Claude Desktop / Cursor as planner |
| [docs/quickstart-jax-gemma.md](docs/quickstart-jax-gemma.md) | JAX/Gemma custom backend + any OpenAI-compat server |
| [docs/quickstart-voice.md](docs/quickstart-voice.md) | Voice → Octopus → surfaces → TTS |
| [docs/octopus-integration.md](docs/octopus-integration.md) | OctoDeck event flow, REST API, WS events |
| [OCTOPUS.md](OCTOPUS.md) | Developer constitution — injected into every agent |
| [SKILL.md](SKILL.md) | MCP tool trigger guide, REST API reference |
| [tools/README.md](tools/README.md) | Tool plugin guide |
| [examples/jax-gemma-http/README.md](examples/jax-gemma-http/README.md) | JAX/Gemma server guide |

---

## Attribution

| Component | License | Source |
|---|---|---|
| Octopus Agent System (`node/`, `python/`) | Apache 2.0 | [Boyapati13/Octopus-Agent-System](https://github.com/Boyapati13/Octopus-Agent-System) |
| AgentDeck (`bridge/`, Android, Apple, ESP32…) | MIT | [puritysb/AgentDeck](https://github.com/puritysb/AgentDeck) |
| ECC Skills integration | Apache 2.0 | [affaan-m/everything-claude-code](https://github.com/affaan-m/everything-claude-code) |
| Brand icons | MIT | [lobehub/lobe-icons](https://github.com/lobehub/lobe-icons) |

**Independent project. Not affiliated with Anthropic, OpenAI, Google, Elgato, DIVOOM, or Ulanzi.**
