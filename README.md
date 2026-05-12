<p align="center">
  <img src="docs/media/agentdeck-icon.png" width="150" alt="OctoDeck — octopus agent system with physical control surface">
</p>

<h1 align="center">🐙 Octopus Agent System</h1>
<h3 align="center">OctoDeck Edition — v3.0</h3>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache%202.0-blue.svg"></a>
  <img src="https://img.shields.io/badge/version-3.0.0-brightgreen.svg">
  <img src="https://img.shields.io/badge/agents-14%20specialist-blue.svg">
  <img src="https://img.shields.io/badge/MCP%20tools-23-orange.svg">
  <img src="https://img.shields.io/badge/AgentShield-102%20rules-red.svg">
  <img src="https://img.shields.io/badge/tests-113%20passing-brightgreen.svg">
  <img src="https://img.shields.io/badge/surfaces-13%20displays-purple.svg">
</p>

<p align="center">
  <img src="https://img.shields.io/badge/node-%3E%3D18-green.svg">
  <img src="https://img.shields.io/badge/python-%3E%3D3.11-yellow.svg">
  <img src="https://img.shields.io/badge/LLM-Claude%20%7C%20GPT--4o%20%7C%20Gemini%20%7C%20Ollama-blueviolet.svg">
  <img src="https://img.shields.io/badge/MCP-stdio%20server-black.svg">
  <img src="https://img.shields.io/badge/Stream%20Deck%2B-8%20keys%20%2B%204%20encoders-black.svg?logo=elgato">
</p>

---

> **A self-evolving, continuously-learning multi-agent AI orchestration system — now with a physical 13-surface control dashboard.**

Octopus Agent System v3.0 (OctoDeck Edition) is the merger of two open-source projects:

- **Octopus Agent System** — 14 specialist AI agents, 23 MCP tools, 5-layer memory architecture, 102-rule security scanner (AgentShield), Continuous Learning v2 (Instincts), parallel QA execution, and a 4-provider LLM gateway (Claude · GPT-4o · Gemini · Ollama).
- **AgentDeck** — a physical control surface that monitors and steers AI agent chains across **13 display surfaces simultaneously**: Elgato Stream Deck+, Android tablets/e-ink readers, Apple devices (iOS/iPadOS/macOS), ESP32 AMOLED/IPS modules, Pixoo64 LED matrix, TUI terminal dashboard, and more.

<p align="center">
  <img src="assets/AgentDeck_SNS_Collage.png" width="720" alt="13 surfaces showing live Octopus agent chain progress">
</p>

---

## Table of Contents

- [What's New in v3.0](#whats-new-in-v30)
- [Architecture](#architecture)
- [Quick Start](#quick-start)
- [Octopus Agent System](#octopus-agent-system)
  - [14 Specialist Agents](#14-specialist-agents)
  - [Cortex Planning Patterns](#cortex-planning-patterns)
  - [5-Layer Memory](#5-layer-memory)
  - [AgentShield Security](#agentshield-security)
  - [MCP Tool Catalogue](#mcp-tool-catalogue)
  - [Continuous Learning (Instincts)](#continuous-learning-instincts)
- [OctoDeck Control Surface](#octodeck-control-surface)
  - [Stream Deck+ Layout](#stream-deck-layout)
  - [13 Display Surfaces](#13-display-surfaces)
- [Configuration](#configuration)
- [Testing](#testing)
- [Development](#development)
- [Roadmap](#roadmap)
- [Attribution](#attribution)

---

## What's New in v3.0

### OctoDeck Fusion (this release)
- **AgentDeck integration** — every Octopus agent chain is now visible and controllable across 13 physical/digital display surfaces in real-time
- **OctopusAdapter** — a new `AgentAdapter` implementation plugs Octopus into the AgentDeck bridge: PLAN / RUN / STOP / SHIELD controls on Stream Deck+
- **APME → Instincts loop** — AgentDeck's session performance evaluations automatically generate instinct candidates, posted back to Octopus Continuous Learning. Chains get smarter after every session.
- **OctopusDeckLayout** — 8 dedicated keys for PLAN · RUN · STOP · AGENTS · SECURITY · MEMORY · INSTINCTS · SHIELD + 4 encoder wheels (Task / Agent / Memory / LLM Provider)

### Octopus v2.0 (ECC Fusion, included)
- **~75% QA speedup** — `Promise.allSettled` parallel gate execution
- **~60% token cost reduction** — `MAX_THINKING_TOKENS` cap + Strategic Compaction
- **195+ ECC skills** — pre-vetted, primary source before npm/PyPI/GitHub
- **AgentShield** — 102-rule static scanner (secrets · permissions · hook injection · MCP risk · code quality)
- **Continuous Learning v2** — instinct extraction, confidence lifecycle, automatic skill elevation at ≥ 0.8
- **Ollama/Gemma 4** — full local inference, no cloud dependency required

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                   Octopus Agent System — OctoDeck Edition            │
│                                                                      │
│  ┌──────────────────────┐    ┌─────────────────────────────────────┐ │
│  │   octopus/node/      │    │       bridge/ (AgentDeck)           │ │
│  │                      │◄───│  OctopusAdapter   ← NEW             │ │
│  │  Cortex (planner)    │    │  OctopusClient    ← NEW             │ │
│  │  Atlas               │    │  OctopusDeckLayout← NEW             │ │
│  │  Architect           │    │  ApmOctopusBridge ← NEW             │ │
│  │  Forge               │    │  StateMachine + APME                │ │
│  │  Reviewer ─────────┐ │    └───────────────┬─────────────────────┘ │
│  │  SecurityReviewer  │ │    ┌───────────────▼─────────────────────┐ │
│  │  Probe  ─── QA ───►│─────►    13 Display Surfaces               │ │
│  │  FactChecker       │ │    │  Stream Deck+  Android  Apple       │ │
│  │  + 6 more agents   │ │    │  ESP32  Pixoo64  TUI  + 7 more     │ │
│  │                    │ │    └─────────────────────────────────────┘ │
│  │  AgentShield 102✓  │ │                                            │
│  │  Instincts (learn) │ │    ┌─────────────────────────────────────┐ │
│  │  5-layer memory    │◄────►   octopus/python/ (Flask :5000)      │ │
│  │  REST API :3001    │ │    │  L1 graph · L2 ADRs · L3 sessions   │ │
│  └──────────────────────┘    └─────────────────────────────────────┘ │
│                                                                      │
│  LLM Gateway:  Anthropic Claude · OpenAI GPT-4o · Google Gemini     │
│                Ollama / Gemma 4 (local, no API key needed)           │
└──────────────────────────────────────────────────────────────────────┘
```

### Monorepo Layout

```
octopus-agent-system/
│
├── octopus/                        ← Core Octopus engine
│   ├── node/src/
│   │   ├── agents/                 ← 14 specialist agent modules
│   │   │   ├── cortex.js           ← Planner (TDD/security/research routing)
│   │   │   ├── forge.js            ← Implementation
│   │   │   ├── reviewer.js         ← Code quality gate
│   │   │   ├── securityReviewer.js ← OWASP + AgentShield gate
│   │   │   ├── probe.js            ← Test coverage gate
│   │   │   ├── factChecker.js      ← Grounding gate
│   │   │   └── ... 8 more
│   │   ├── skills/
│   │   │   └── agentshield.js      ← 102-rule static scanner
│   │   ├── runner.js               ← Parallel QA (Promise.allSettled)
│   │   ├── instincts.js            ← Continuous Learning v2
│   │   ├── llm.js                  ← 4-provider LLM gateway
│   │   ├── mcp.js                  ← MCP stdio server (20 tools)
│   │   └── server.js               ← REST API (:3001)
│   ├── python/
│   │   ├── memory/                 ← L1 graph store, L2 ADRs, schema
│   │   └── services/               ← Flask memory REST API (:5000)
│   ├── OCTOPUS.md                  ← Developer constitution
│   ├── SKILL.md                    ← Trigger guide + tool reference
│   └── start_mcp.sh / .ps1        ← Full-stack startup
│
├── bridge/src/
│   ├── adapters/
│   │   ├── octopus-adapter.ts      ← NEW: Octopus ↔ AgentDeck bridge
│   │   ├── claude-code.ts          ← Claude Code (existing)
│   │   └── codex-cli.ts, ...       ← Other adapters (existing)
│   └── octopus/
│       ├── octopus-client.ts       ← NEW: HTTP+WS client (:3001/:5000)
│       ├── octopus-deck-layout.ts  ← NEW: 8-key + 4-encoder layout
│       └── apme-octopus-bridge.ts  ← NEW: APME → Instincts feedback
│
├── plugin/                         ← Stream Deck+ SDK v2 plugin
├── android/                        ← Jetpack Compose (Android 10+)
├── apple/                          ← SwiftUI (iOS 17+ / macOS 14+)
├── esp32/                          ← PlatformIO firmware (LVGL)
├── shared/                         ← TypeScript protocol types
├── hooks/                          ← Claude Code hook installer
└── docs/                           ← Architecture, device, protocol docs
```

---

## Quick Start

### Option A — Octopus only (no hardware needed)

```bash
git clone https://github.com/Boyapati13/Octopus-Agent-System.git
cd Octopus-Agent-System/octopus

# Install Node dependencies
cd node && npm install && cd ..

# Install Python dependencies
pip install -r python/requirements.txt --break-system-packages

# Configure
cp node/.env.example node/.env
# Edit node/.env — set LLM_PROVIDER, add API key (or use Ollama)

# Start everything
./start_mcp.sh       # Mac/Linux
# .\start_mcp.ps1   # Windows
```

Add to Claude Desktop / Cursor / Windsurf `claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "octopus": {
      "command": "node",
      "args": ["/path/to/octopus/node/src/mcp.js"]
    }
  }
}
```

All 20 Octopus MCP tools now appear in your LLM client.

### Option B — Full OctoDeck (Octopus + 13 surfaces)

```bash
git clone https://github.com/Boyapati13/Octopus-Agent-System.git
cd Octopus-Agent-System

# Install all packages (requires Node.js ≥ 22, pnpm)
pnpm install && pnpm build

# Terminal 1 — Octopus backend
./octopus/start_mcp.sh

# Terminal 2 — AgentDeck bridge + surfaces
agentdeck octopus
```

### Local LLM (No API Key Required)

```bash
# Install Ollama: https://ollama.ai
ollama pull gemma4:e2b    # ~3 GB — fast, most tasks
ollama pull gemma4:9b     # ~8 GB — complex planning
```

`octopus/node/.env`:
```env
LLM_PROVIDER=ollama
LLM_MODEL=gemma4:e2b
OLLAMA_BASE_URL=http://localhost:11434
SAFE_MODE=false
AGENTSHIELD_MODE=advisory
```

---

## Octopus Agent System

### 14 Specialist Agents

| Agent | Role | Gate | Description |
|---|---|---|---|
| **Cortex** | Planner | ✅ | LLM-driven task decomposition. Routes to TDD / security / research-first patterns by keyword |
| **Atlas** | Memory | | Searches L1 structural memory — files, symbols, relationships |
| **Architect** | Design | | Boundary impact analysis before any implementation |
| **Forge** | Implementation | | Scoped edit plans, instinct-aware coding |
| **FactChecker** | Grounding | ✅ | Parallel QA gate — catches hallucinations and unsupported claims |
| **Reviewer** | Quality | ✅ | Parallel QA gate — code quality, style, maintainability |
| **SecurityReviewer** | Security | ✅ | OWASP Top 10 + 3-layer AgentShield pipeline |
| **Probe** | Testing | ✅ | Parallel QA gate — enforces 80% coverage minimum |
| **Scribe** | Docs | | Documentation, changelog, ADR generation |
| **ReleaseKeeper** | Release | ✅ | Final gate before any release or deployment |
| **Navigator** | Browser | | `navigate` / `snapshot` / `interact` automation |
| **MarketScout** | Skills | | ECC library (195+ skills) → npm → PyPI → GitHub |
| **Toolsmith** | Synthesis | | LLM-generates novel skills for unknown tasks |
| **SandboxQA** | Validation | ✅ | Isolated skill validation with 3× self-correction loop |

### Cortex Planning Patterns

Cortex automatically selects the optimal agent chain based on task keywords:

```
Default:         Atlas → Architect → Forge → [Reviewer ‖ SecurityReviewer ‖ Probe ‖ FactChecker] → Scribe → ReleaseKeeper
TDD-first:       Atlas → Probe (write tests first) → Forge → [QA gates] → Scribe
Security-first:  Atlas → SecurityReviewer → Forge → [QA gates] → Scribe
Research-first:  Atlas → FactChecker → Architect → Forge → [QA gates] → Scribe
```

The `[QA gates]` stage runs **in parallel** via `Promise.allSettled` — ~75% faster than sequential.

### 5-Layer Memory

```
L5  Task Context Profile   Ephemeral, per-call
    │  OCTOPUS.md constitution (immutable)
    │  ECC rules (.claude/rules/*.md)
    │  Instincts (confidence ≥ 0.7, top 10)
    │  L1 structural facts
    │  L2 architectural decisions
    └  L3 session context

L4  Prompt Cache            Redis (or in-memory fallback)   Session-scoped
L3  Run State               SQLite                          Session-scoped
L2  Decision Memory (ADRs)  SQLite append-only              Project lifetime
L1  Structural Memory       SQLite + NetworkX graph         Project lifetime
```

L5 context is assembled fresh on every agent invocation. The OCTOPUS.md constitution is always first, overriding any learned pattern or LLM tendency.

### AgentShield Security

Three independent security layers, ordered by cost:

| Layer | Component | Cost | Mechanism |
|---|---|---|---|
| 1 | PreToolUse hook | Zero tokens (sync) | Pattern match — blocks `rm -rf /`, `DROP DATABASE`, fork bombs before any LLM cost |
| 2 | SecurityReviewer agent | LLM call | OWASP Top 10 quick scan + AgentShield 5-category pass |
| 3 | AgentShield gate | Zero tokens (static) | 102-rule static scanner in advisory or gate mode |

**AgentShield rule categories:**

| Code | Category | Rules | Catches |
|---|---|---|---|
| AS-S | Secrets | 14 | API keys, private keys, hardcoded credentials |
| AS-P | Permissions | 20 | `SAFE_MODE=false`, `new Function()`, `eval()`, `__proto__` |
| AS-H | Hook Injection | 15 | `$()` in hooks, unescaped `execSync` |
| AS-M | MCP Risk | 15 | `autoApprove: true`, raw shell transport |
| AS-A | Agent Config | 15 | Path traversal in `agentName`, unconditional `approved: true` |
| AS-Q | Code Quality | 23 | `console.log`, `var`, `any`, empty catch, `innerHTML=` |

### MCP Tool Catalogue

All 20 tools are available over MCP stdio and REST API (:3001):

| Category | Tool | Description |
|---|---|---|
| Orchestration | `octopus_plan_task` | Cortex decomposes a task into an agent execution plan |
| Orchestration | `octopus_run_task_chain` | Full chain: plan → agents → gates → instinct extraction |
| Memory | `octopus_search_memory` | L1 structural graph search (files, symbols, summaries) |
| Memory | `octopus_get_decisions` | L2 architectural decision log (ADRs) |
| Memory | `octopus_compact_session` | Promote run state to long-term memory |
| Files | `octopus_read_file` | Read workspace file |
| Files | `octopus_write_file` | Write + auto-format workspace file |
| Files | `octopus_execute_command` | Run shell commands in workspace |
| Agents | `octopus_create_agent` | Hot-reload a new specialist agent |
| Agents | `octopus_scan_security` | OWASP + AgentShield file scan |
| LLM | `octopus_llm_complete` | Send prompt to active LLM provider |
| Browser | `octopus_browser_navigate` | Open URL + capture accessibility snapshot |
| Browser | `octopus_browser_snapshot` | Snapshot active browser page |
| Browser | `octopus_browser_interact` | Click / fill / eval on page |
| Skills | `octopus_skill_scout` | Search ECC library → npm → PyPI → GitHub |
| Skills | `octopus_skill_synthesize` | Toolsmith LLM synthesis of novel skill |
| Skills | `octopus_skill_validate` | SandboxQA isolated validation (3× self-correct) |
| Skills | `octopus_skill_deploy` | Deploy validated skill to active registry |
| Skills | `octopus_skill_retire` | Retire a skill from the registry |
| Skills | `octopus_skill_list` | List all active skills |

### Continuous Learning (Instincts)

Every completed agent chain feeds Octopus's self-improvement loop:

```
Agent session completes
        ↓
extractCandidates()   — confidence-weighted pattern scoring
        ↓
cluster()             — word-overlap similarity grouping
        ↓
persistInstinct()     — SQLite instincts table
        ↓
confidence ≥ 0.7     → injected into L5 context for 6 agents
confidence ≥ 0.8     → elevated to active skill via MarketScout
```

**OctoDeck adds a second learning input:** AgentDeck's APME (Agent Performance Evaluation) module evaluates session quality using category-specific rubrics. Low-scoring categories auto-generate instinct candidates posted to `/instincts` — so performance measurement directly drives skill improvement.

---

## OctoDeck Control Surface

### Stream Deck+ Layout

```
┌─────────┬─────────┬─────────┬─────────┐
│  PLAN   │   RUN   │  STOP   │ AGENTS  │
│   🔵    │   🟡    │   🔴    │   🟢    │
│ Blue=   │ Amber=  │ Red=    │ Green=  │
│planning │running  │stop     │gate pass│
├─────────┼─────────┼─────────┼─────────┤
│SECURITY │ MEMORY  │INSTINCT │ SHIELD  │
│   🟠    │   🔵    │   🟣    │   🔴    │
│ OWASP   │ L1 mem  │ learn   │ 102-rule│
│ scan    │ search  │ pulse   │ scanner │
└─────────┴─────────┴─────────┴─────────┘

LCD Touch Strip — 4 Encoder Wheels:
  E1  Task Prompt   rotate=scroll history  press=send to Octopus
  E2  Agent Focus   rotate=cycle agents    press=view agent details
  E3  Memory Query  rotate=browse context  press=L1 memory search
  E4  LLM Provider  rotate=switch provider (Claude / GPT-4o / Gemini / Ollama)
```

**Key behaviors at a glance:**

- **PLAN** → calls `octopus_plan_task`; full agent chain shown on LCD strip before running
- **RUN** → calls `octopus_run_task_chain`; turns amber for chain duration
- **STOP** → sends interrupt to running chain; only active during live run
- **AGENTS** → green flash on gate pass, red flash + reason text on gate fail
- **SECURITY** → runs `octopus_scan_security` on current file, results on all surfaces
- **MEMORY** → searches L1 structural memory, results scroll on LCD strip
- **INSTINCTS** → pulses purple when new instinct is learned; confidence on LCD
- **SHIELD** → shows current AgentShield mode (none / advisory / gate); press to cycle

### 13 Display Surfaces

All 13 surfaces update simultaneously from a single WebSocket event stream:

| Surface | Octopus Features |
|---|---|
| **Stream Deck+** | Full PLAN/RUN/STOP/SHIELD control; agent name on LCD strip |
| **Ulanzi D200H** | Chain status + key control |
| **Android tablet** | Live agent timeline card with gate pass/fail history |
| **Android e-ink** | Grayscale-optimised chain status (Crema / Onyx / Kobo) |
| **iOS / iPadOS** | SwiftUI real-time agent updates + control |
| **macOS SwiftUI** | In-process daemon, no Node.js dependency |
| **TUI terminal** | Agent swimlane view — one row per agent, live progress |
| **ESP32 AMOLED** | Current agent name + progress bar |
| **ESP32 IPS** | Chain status display |
| **Ulanzi TC001 LED** | Status strip — amber=running, green=done, red=fail |
| **Pixoo64 LED matrix** | Octopus creature pulses once per active agent |
| **iTerm2 badges** | Current agent name in tab title and badge |
| **Wake word** | Offline voice → Octopus task prompt |

---

## Configuration

### Octopus (`octopus/node/.env`)

| Variable | Default | Description |
|---|---|---|
| `LLM_PROVIDER` | `anthropic` | `anthropic` · `openai` · `google` · `ollama` |
| `LLM_MODEL` | provider default | Override model — e.g. `gemma4:e2b`, `gpt-4o-mini` |
| `MAX_THINKING_TOKENS` | `10000` | Token cap per LLM call (~60% cost reduction) |
| `COMPACT_THRESHOLD` | `50` | Tool calls before strategic compaction |
| `SAFE_MODE` | `true` | `false` to enable file writes + shell commands |
| `AGENTSHIELD_MODE` | `advisory` | `none` · `advisory` · `gate` (blocking) |
| `ECC_HOOK_PROFILE` | `standard` | `minimal` · `standard` · `strict` |
| `ECC_RULES_PATH` | `.claude/rules` | Always-loaded ECC guardrail directory |
| `PROJECT_ROOT` | `.` | Workspace root for file tools |
| `MEMORY_SERVICE_URL` | `http://localhost:5000` | Python memory service |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama server URL |
| `OCTOPUS_WEBHOOK_URL` | — | Slack/Discord webhook on chain completion |

### LLM Providers

| Provider | Setting | Models | Key Required |
|---|---|---|---|
| Anthropic Claude | `LLM_PROVIDER=anthropic` | claude-opus-4, claude-sonnet-4, claude-haiku-4 | `ANTHROPIC_API_KEY` |
| OpenAI GPT-4o | `LLM_PROVIDER=openai` | gpt-4o, gpt-4o-mini | `OPENAI_API_KEY` |
| Google Gemini | `LLM_PROVIDER=google` | gemini-2.0-flash, gemini-1.5-pro | `GOOGLE_API_KEY` |
| Ollama (local) | `LLM_PROVIDER=ollama` | gemma4:e2b · gemma4:26b · gemma4:31b · gemma3:27b · qwen2.5-coder:7b | None |
| NVIDIA NIM (free) | `LLM_PROVIDER=nvidia` | meta/llama-3.1-405b-instruct · mistral-nemo · nemotron | `NVIDIA_API_KEY` (free at build.nvidia.com) |

### Gemma 4 — recommended (April 2026, native function calling + multimodal)

All Gemma 4 models have **native function-calling** built in and support multimodal input.

| Model | Disk | Context | Modalities | Best for |
|---|---|---|---|---|
| **`gemma4:e2b`** | 7.2 GB | 128K | text · image · **audio** | **Default + Sovereign Fallback** |
| `gemma4:e4b` | 9.6 GB | 128K | text · image · **audio** | Step-up, edge/mobile |
| `gemma4:26b` | 18 GB | **256K** | text · image | MoE — 3.8B active params, fast Cortex planning |
| `gemma4:31b` | 20 GB | **256K** | text · image | **Best local quality** — 85.2% MMLU Pro |

### Gemma 3 — vision + 140 languages

| Model | Disk | Context | Notes |
|---|---|---|---|
| `gemma3:4b` | 3.3 GB | 128K | Fast vision |
| `gemma3:12b` | 8.1 GB | 128K | Balanced quality + vision |
| `gemma3:27b` | 17 GB | 128K | Best Gemma 3, complex vision tasks |
| `gemma3:4b-it-qat` | ~1 GB | 128K | 3× less memory than gemma3:4b, same quality |
| `gemma3:12b-it-qat` | ~3 GB | 128K | BF16 quality at reduced memory |

```bash
# Pull recommended models
ollama pull gemma4:e2b          # default — already on your machine
ollama pull gemma4:26b          # MoE — 18 GB disk / 3.8B active / 256K ctx
ollama pull gemma4:31b          # best — 20 GB / 256K ctx / 85.2% MMLU Pro
ollama pull gemma3:4b-it-qat    # vision + 3× lower memory
ollama pull qwen2.5-coder:7b    # coding tasks — already on your machine
```

After pulling: `cd node && npm run cross-link` regenerates `adapters/ollama-config.json` with your new models.

---

## Testing

### Currently runnable (113 tests, all green)

```bash
# Node.js — Jest  (72 tests)
cd node && npm test
```
```
Test Suites: 6 passed, 6 total   |   Tests: 72 passed
  agents.test.js              32   14 agents: contract + run() · SecurityReviewer · ReleaseKeeper
  agents_marketplace.test.js  16   Navigator · MarketScout · Toolsmith · SandboxQA
  commands.test.js             6   REST API: health · agents · onboard · plan · run · 404
  mcp.test.js                  6   MCP server: 23 tools · SAFE_MODE guards · concurrent calls
  memory.test.js               3   5-layer structural memory bridge
  vault_fallback.test.js       9   Zero-Key 4-tier cascade · Ollama routing · Sovereign Fallback
```

```bash
# Python — pytest  (41 tests)
py -m pytest python/tests/ -q          # Windows
python3 -m pytest python/tests/ -q    # Mac/Linux
```
```
41 passed in ~22s
  test_graph_store.py     11   node upsert · edge queries · relevance scoring · boundary impact
  test_indexer.py         13   symbol extraction · skip rules · incremental indexer
  test_memory_service.py   9   health · search · decisions · compact · context assembly
  test_schema.py           8   decision CRUD · run state · upsert semantics
```

> **Expected console output during Node tests (not failures):**
> `[cortex] LLM planning failed — using keyword fallback` — no real LLM in tests; fallback is by design.
> `AgentShield scan skipped — hook guard active` — deduplication guard fires correctly.

### Coming with full OctoDeck setup

```bash
pnpm test          # AgentDeck bridge — Vitest (bridge / plugin / shared / hooks)
pnpm test:android  # Android — JUnit + Robolectric
# Xcode → AgentDeckTests scheme for Apple (iOS/iPadOS/macOS)
```
These require the full AgentDeck monorepo packages (`shared`, `plugin`, `hooks`, `setup`) which are not yet included in this repo.

---

## Development

```bash
# Install all dependencies
pnpm install

# Build all packages
pnpm build

# Watch mode (bridge + plugin + shared)
pnpm -r --parallel dev

# Start Octopus MCP server
cd octopus && npm run mcp

# Start Octopus REST API (:3001)
cd octopus && npm run serve

# Start Python memory service (:5000)
py octopus/python/services/memory_service.py     # Windows
# python3 octopus/python/services/memory_service.py  # Mac/Linux

# Start AgentDeck bridge in Octopus mode
agentdeck octopus

# Creature simulator demo
pnpm demo
```

### Adding a New Agent

1. Create `octopus/node/src/agents/yourAgent.js` following existing agent pattern
2. Register in `octopus/node/src/agents/index.js`
3. Optionally add a key slot in `bridge/src/octopus/octopus-deck-layout.ts`
4. Add test cases to `octopus/node/tests/agents.test.js`

### Adding a Display Surface

Follow the AgentDeck device adapter pattern in `bridge/src/modules/`. The `OctopusAdapter` emits standard `AdapterEvent` frames (`spinner_start`, `tool_action`, `status_line`, `idle`) — any surface that handles these will render Octopus state without modification.

---

## Roadmap

- [ ] Voice → Octopus task via offline wake word (Porcupine / microWakeWord on ESP32)
- [ ] Instinct confidence bar on Pixoo64 LED rows
- [ ] Multi-chain view — parallel Octopus chains on separate Stream Deck key rows
- [ ] APME rubrics tuned for Octopus metrics (gate failure rate, instinct graduation rate, chain latency)
- [ ] AgentShield findings pushed to Apple/Android notification surfaces
- [ ] Ollama model hot-swap via E4 encoder without Octopus restart
- [ ] TUI agent swimlane — one row per agent, live token counters + timing

---

## Attribution

| Component | License | Source |
|---|---|---|
| Octopus Agent System (`octopus/`) | Apache 2.0 | [Boyapati13/Octopus-Agent-System](https://github.com/Boyapati13/Octopus-Agent-System) |
| AgentDeck (bridge, plugin, android, apple, esp32...) | MIT | [puritysb/AgentDeck](https://github.com/puritysb/AgentDeck) |
| ECC Skills integration | Apache 2.0 | [affaan-m/everything-claude-code](https://github.com/affaan-m/everything-claude-code) |
| Brand icons | MIT | [lobehub/lobe-icons](https://github.com/lobehub/lobe-icons) |

**Independent project. Not affiliated with Anthropic, OpenAI, Google, Elgato, DIVOOM, or Ulanzi.**

---

## Documentation

| Doc | Content |
|---|---|
| [octopus/OCTOPUS.md](octopus/OCTOPUS.md) | Developer constitution — injected into every agent's L5 context |
| [octopus/SKILL.md](octopus/SKILL.md) | MCP tool trigger guide, memory layer reference |
| [docs/octopus-integration.md](docs/octopus-integration.md) | OctoDeck integration — event flow, new files, APME→Instincts mapping |
| [docs/architecture.md](docs/architecture.md) | BridgeCore, PtyAdapter, Gateway protocol |
| [docs/apme-pipeline.md](docs/apme-pipeline.md) | 8-layer APME session evaluation deep dive |
| [docs/streamdeck-layout.md](docs/streamdeck-layout.md) | Stream Deck+ per-state layouts, encoder details |
| [docs/android.md](docs/android.md) | Android device support, e-ink optimisation rules |
| [docs/testing.md](docs/testing.md) | Coverage thresholds, CI pipeline |
| [octopus/OCTOPUS_CHANGELOG.md](octopus/OCTOPUS_CHANGELOG.md) | Octopus v1.0 → v2.0 → v3.0 history |
| [DEVELOPMENT_LOG.md](DEVELOPMENT_LOG.md) | Full AgentDeck development history |
