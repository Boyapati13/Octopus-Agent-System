<p align="center">
  <img src="docs/media/agentdeck-icon.png" width="150" alt="OctoDeck — octopus agent system with physical control surface">
</p>

<h1 align="center">🐙 Octopus Agent System</h1>
<h3 align="center">O.C.T.O Command Interface — v4.0</h3>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache%202.0-blue.svg"></a>
  <img src="https://img.shields.io/badge/version-4.0.0-brightgreen.svg">
  <img src="https://img.shields.io/badge/agents-14%20specialist-blue.svg">
  <img src="https://img.shields.io/badge/MCP%20tools-26-orange.svg">
  <img src="https://img.shields.io/badge/models-8%20specialist%20AI-blueviolet.svg">
  <img src="https://img.shields.io/badge/gateways-6%20platforms-cyan.svg">
  <img src="https://img.shields.io/badge/tests-20%2F20%20passing-brightgreen.svg">
</p>

<p align="center">
  <img src="https://img.shields.io/badge/node-%3E%3D18-green.svg">
  <img src="https://img.shields.io/badge/python-%3E%3D3.11-yellow.svg">
  <img src="https://img.shields.io/badge/NVIDIA%20NIM-8%20models-76b900.svg">
  <img src="https://img.shields.io/badge/Hermes-3%20%7C%204%20via%20OpenRouter-orange.svg">
  <img src="https://img.shields.io/badge/Gateways-Telegram%20%7C%20Discord%20%7C%20Slack%20%7C%20WhatsApp%20%7C%20Signal%20%7C%20HA-blue.svg">
</p>

---

> **A self-evolving, continuously-learning multi-agent AI system with a J.A.R.V.I.S-style HUD dashboard, 8-specialist model routing, document analysis, live web search, and 6 messaging platform gateways.**

---

## Install — one command

```powershell
# Windows — PowerShell
.\install.ps1

# Remote one-liner:
powershell -ExecutionPolicy Bypass -Command "iex (irm https://raw.githubusercontent.com/Boyapati13/Octopus-Agent-System/master/install.ps1)"
```

```bash
# Mac / Linux
./install.sh
```

After install, start everything:

```powershell
.\start_server.ps1   # starts API + WebSocket + memory service
```

Open: **http://localhost:3001**

On first run you are redirected to the **Setup Wizard** automatically. Once configuration is saved, `http://localhost:3001` opens the HUD dashboard directly.

---

## Table of Contents

- [What's New in v4.0](#whats-new-in-v40)
- [Setup Wizard](#setup-wizard)
- [Architecture](#architecture)
- [O.C.T.O HUD Dashboard](#octo-hud-dashboard)
- [Multi-Model AI Router](#multi-model-ai-router)
- [Web Search](#web-search)
- [Document Upload & Analysis](#document-upload--analysis)
- [Messaging Gateways](#messaging-gateways)
- [Home Assistant](#home-assistant)
- [Octopus Agent System](#octopus-agent-system)
- [Configuration](#configuration)
- [LLM Providers](#llm-providers)
- [REST API Reference](#rest-api-reference)
- [WebSocket Events](#websocket-events)
- [Testing](#testing)
- [Development](#development)
- [Uninstall](#uninstall)

---

## What's New in v4.0

### O.C.T.O Command Interface (HUD Dashboard)
- **Mark-XXXIX / J.A.R.V.I.S-inspired UI** — animated HUD canvas with rotating rings, particles, waveform, scan arcs
- **3-panel layout** — System Monitor (left) · Animated HUD + Answer (center) · Activity Center (right)
- **Mark-XXXIX color palette** — deep black `#00060a`, cyan `#00d4ff`, orange accent `#ff6b00`
- **7 tabbed panels** — Log · Conversation · Web Search · Documents · Gateways · Router · Events
- **Real-time HUD states** — LISTENING / SPEAKING / PROCESSING / IDLE with visual feedback
- **Live clock + system metrics** — CPU/MEM/NET/AGT bars from `/api/health`

### Multi-Model AI Router
- **8 specialist models** — each agent role routes to the best free model on NVIDIA NIM or OpenRouter
- **Hermes-3 / Hermes-4** (NousResearch) via OpenRouter — best agentic tool-use model
- **`LLM_PROVIDER=router`** — automatic routing, no manual model switching
- **OpenRouter** added as a new provider (`OPENROUTER_API_KEY`)
- **Env override** per role: `ROUTE_planner=nvidia:moonshotai/kimi-k2-thinking`

### Web Search
- **`POST /api/search`** — DuckDuckGo (no key), Brave Search, SerpAPI, or NVIDIA Solar
- Auto-selects best available engine from env keys
- Results displayed in the Search tab with title/URL/snippet
- Dashboard search bar with real-time results

### Document Upload & Analysis
- **`POST /api/documents/upload`** — drag-drop or click upload
- **6 analysis modes**: summarise · analyse · extract data · code review · explain · Q&A
- **Supported**: txt, md, json, csv, js, ts, py, java, go, rs, yaml, sql, html, css, xml, log, and all code files
- **Optional**: PDF (`npm install pdf-parse`), DOCX (`npm install mammoth`), XLSX (`npm install xlsx`)
- **Vision**: images routed to `nvidia/nemotron-3-nano-omni-9b` for multi-modal analysis
- **Graceful fallback**: returns extracted text even when LLM is unavailable

### Messaging Gateways
- **Telegram** — bot responds to `/ask` commands and DMs
- **Discord** — bot responds to `!octo` prefix, mentions, and DMs
- **Slack** — Socket Mode, responds to `@mentions` and DMs
- **WhatsApp** — via Baileys (QR scan, no paid API)
- **Signal** — via signal-cli TCP JSON-RPC daemon
- **Home Assistant** — WebSocket integration, event-triggered tasks, result entity writeback
- All gateways share one message pipeline → Octopus task runner → reply back to platform
- Status visible in the **Gates tab** of the dashboard

### Streaming Text Completion
- **`POST /api/complete/stream`** — SSE endpoint for streaming LLM output
- Routable by `role` parameter to any specialist model

---

## Setup Wizard

On first launch `http://localhost:3001` redirects to `/setup` — a six-step configuration wizard that runs before the dashboard opens.

```
┌─────────────────────────────────────────────────────────────────┐
│  OCTOPUS SETUP WIZARD  ·  Initial Configuration                 │
├───────────────┬─────────────────────────────────────────────────┤
│  Sidebar      │  Main Content                                   │
│               │                                                  │
│  1 System     │  • System Check  — auto-tests Node.js,         │
│    Check   ←  │    Memory Service, Ollama, existing .env        │
│               │                                                  │
│  2 LLM        │  • LLM Provider — provider cards (9 options),  │
│    Provider   │    per-provider API key + model fields,         │
│               │    live "Test Connection" button                 │
│  3 Messaging  │                                                  │
│    Gateways   │  • Gateways — toggle accordion for Telegram,   │
│               │    Discord, Slack, WhatsApp, Signal, HA         │
│  4 Advanced   │                                                  │
│    Settings   │  • Advanced — AgentShield mode, Safe/Headless  │
│               │    toggles, port, Redis, GitHub token, webhook  │
│  5 Pre-flight │                                                  │
│    Check      │  • Pre-flight — live connection tests for all  │
│               │    configured services with pass/fail badges    │
│  6 Launch  →  │                                                  │
│               │  • Launch — config summary + Save & Launch      │
└───────────────┴─────────────────────────────────────────────────┘
```

### How it works

1. Start the server — `.\start_server.ps1`
2. Open `http://localhost:3001` — redirects to `/setup` on first run
3. Complete the 6 steps (all gateway/advanced steps are optional)
4. Click **Save & Launch Dashboard** — config is written to `node/.env` and the marker file `node/.setup-complete` is created
5. All subsequent visits to `/` redirect straight to `/dashboard`

### Re-running setup

To reconfigure, delete the marker file and reload:

```powershell
Remove-Item node\.setup-complete
# then open http://localhost:3001 — setup wizard runs again
```

Or call the API:

```bash
POST /api/setup/reset
```

### Setup API

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/setup/status` | Current config state (all keys masked) |
| `POST` | `/api/setup/test-llm` | Live-test an LLM provider connection |
| `POST` | `/api/setup/test-service` | Ping any HTTP service URL |
| `POST` | `/api/setup/save` | Write config to `node/.env` + mark complete |
| `POST` | `/api/setup/reset` | Delete setup marker (triggers re-run on next `/`) |
| `GET` | `/setup` | Setup wizard HTML |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Octopus Agent System — v4.0                              │
│                                                                             │
│  ┌─────────────────────────────────────┐  ┌──────────────────────────────┐ │
│  │   node/src/                         │  │   node/src/gateways/         │ │
│  │                                     │  │                              │ │
│  │  Cortex (planner)                   │  │  Telegram   Discord          │ │
│  │  14 specialist agents               │  │  Slack      WhatsApp         │ │
│  │  REST API  :3001                    │  │  Signal     Home Assistant   │ │
│  │  WS  ws://:3001/ws                  │  │                              │ │
│  │  O.C.T.O Dashboard /dashboard       │  │  manager.js (shared router)  │ │
│  Setup Wizard  /setup               │  └──────────────────────────────┘ │
│  │  AgentShield 102 rules              │  └──────────────────────────────┘ │
│  │  Instincts (learn)                  │                                    │
│  │  Multi-model router                 │  ┌──────────────────────────────┐ │
│  │  Web search (DDG/Brave/Solar)       │  │   node/src/tools/            │ │
│  │  Document analysis (text+vision)    │  │                              │ │
│  │  MCP stdio  26 tools                │  │  web_search.js  (4 engines)  │ │
│  └─────────────────────────────────────┘  │  document.js    (6 modes)    │ │
│                                           └──────────────────────────────┘ │
│  LLM Multi-Model Router (task_router.js):                                   │
│  Planning    → NVIDIA Nemotron Ultra 253B                                   │
│  Coding      → Qwen3-Coder 480B  (NVIDIA NIM)                              │
│  Review      → DeepSeek V4 Pro   (NVIDIA NIM, 1M ctx)                      │
│  Research    → Llama 4 Maverick  (NVIDIA NIM, 128-expert MoE)              │
│  Agentic     → Hermes-3 405B     (OpenRouter, best tool-use)               │
│  Documents   → Nemotron Omni 9B  (NVIDIA NIM, vision+text)                 │
│  Web Search  → Solar Pro+Search  (NVIDIA NIM, built-in search)             │
│  Fallback    → Gemma4:e2b        (Ollama local, always-on)                 │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## O.C.T.O HUD Dashboard

No hardware needed. After `.\start_server.ps1`, open:

**http://localhost:3001/dashboard**

### Layout

```
┌────────────────────────────────────────────────────────────────────┐
│ HEADER  [MARK.O] [O.C.T.O Command Interface]  [HH:MM:SS]  [Status] │
├─────────────┬─────────────────────────────────┬────────────────────┤
│ SYS MONITOR │       ANIMATED HUD CANVAS       │  ACTIVITY CENTER   │
│             │   Rotating rings, particles      │  Tab: Log          │
│ CPU ████    │   Waveform, scan arcs            │  Tab: Conversation │
│ MEM ████    │   Halo glow, tick marks          │  Tab: Web Search   │
│ NET ████    │                                  │  Tab: Documents    │
│ AGT ████    │   ● LISTENING / ▶ PROCESSING     │  Tab: Gateways     │
│             │                                  │  Tab: Router       │
│ STATUSES    │   Answer output (large text)     │  Tab: Events       │
│ Voice       │                                  │                    │
│ WS State    │   Live metrics strip             │  [Composer input]  │
└─────────────┴─────────────────────────────────┴────────────────────┤
│ FOOTER  [Ctrl+Enter Execute · F4 Mute · F11 Fullscreen]  [© OCTO]  │
└────────────────────────────────────────────────────────────────────┘
```

### HUD Canvas States

| State | Visual |
|---|---|
| IDLE | Dim cyan glow, slow rings, sinusoidal waveform |
| LISTENING | Bright cyan, pulsing dot, active waveform |
| PROCESSING | Amber rings, faster rotation, `▶ PROCESSING` text |
| SPEAKING | Pink/magenta halo, particle burst, `● SPEAKING` text |

---

## Multi-Model AI Router

Enable with `LLM_PROVIDER=router` in `node/.env`. Each agent role is automatically routed to the best free model:

| Role | Model | Provider | Why |
|---|---|---|---|
| **planning** (Cortex) | `nvidia/llama-3.1-nemotron-ultra-253b-v1` | NVIDIA NIM | NVIDIA SOTA reasoning, beats GPT-4o |
| **architecture** | `moonshotai/kimi-k2-thinking` | NVIDIA NIM | Deep chain-of-thought design |
| **implementation** (Forge) | `qwen/qwen3-coder-480b-a35b-instruct` | NVIDIA NIM | Purpose-built coder, top SWE-bench |
| **review** (Reviewer) | `deepseek-ai/deepseek-v4-pro` | NVIDIA NIM | 1M token context, deep codebase review |
| **testing** (Probe) | `deepseek-ai/deepseek-v4-pro` | NVIDIA NIM | Strong test generation + TDD |
| **security** | `meta/llama-3.3-70b-instruct` | NVIDIA NIM | Broad OWASP knowledge |
| **verification** (FactChecker) | `microsoft/phi-4-128k-instruct` | NVIDIA NIM | Precise grounding, 128K context |
| **research** | `meta/llama-4-maverick-17b-128e-instruct` | NVIDIA NIM | 128-expert MoE, wide knowledge |
| **agentic** | `nousresearch/hermes-3-llama-3.1-405b` | OpenRouter | Best-in-class tool-use + function calling |
| **document-analysis** | `nvidia/nemotron-3-nano-omni-9b` | NVIDIA NIM | Vision + text, multi-modal |
| **web-search** | `upstage/solar-pro-preview-with-search` | NVIDIA NIM | Built-in web search capability |
| **memory / browser** | `gemma4:e2b` | Ollama (local) | Always-on, no latency, no key needed |

### Router env vars

```env
# Enable router
LLM_PROVIDER=router

# Required keys (get free trials at build.nvidia.com and openrouter.ai)
NVIDIA_API_KEY=nvapi-xxxxxxxxxxxx
OPENROUTER_API_KEY=sk-or-xxxxxxxxxxxx

# Override any role: ROUTE_<ROLE>=<provider>:<model>
ROUTE_planner=openrouter:nousresearch/hermes-4-405b
ROUTE_implementation=nvidia:deepseek-ai/deepseek-v4-pro
```

### Hermes Models (NousResearch via OpenRouter)

| Model | ID | Best For |
|---|---|---|
| Hermes-3 405B | `nousresearch/hermes-3-llama-3.1-405b` | Agentic tool-use, 131K context |
| Hermes-4 405B | `nousresearch/hermes-4-405b` | Hybrid reasoning + tool-use |
| Hermes-4 70B  | `nousresearch/hermes-4-llama-3.1-70b` | Fast, efficient, reasoning |

Use via caller preset: `OCTOPUS_CALLER=hermes3` or `OCTOPUS_CALLER=hermes4`

---

## Web Search

### API

```bash
POST /api/search
{ "query": "NVIDIA NIM models 2025", "limit": 8, "engine": "auto" }

# Response
{
  "query": "...",
  "results": [{ "title": "...", "url": "...", "snippet": "...", "source": "ddg" }],
  "markdown": "formatted string for LLM"
}
```

### Engine selection (auto-priority)

| Priority | Engine | Key Required |
|---|---|---|
| 1 | SerpAPI (Google results) | `SERP_API_KEY` |
| 2 | Brave Search | `BRAVE_API_KEY` |
| 3 | NVIDIA Solar (LLM+search) | `NVIDIA_API_KEY` + `useSolar:true` |
| 4 | DuckDuckGo | None — always available |

---

## Document Upload & Analysis

### API

```bash
# Upload and analyse
POST /api/documents/upload
Content-Type: multipart/form-data

Fields:
  file     — any supported file (see below)
  mode     — summarise | analyse | extract | code_review | explain | qa
  question — (optional) question for qa mode

# Response
{
  "ok": true,
  "filename": "README.md",
  "type": "text",
  "charCount": 12400,
  "analysis": "This document describes...",
  "analysisError": null   // non-null if LLM was unavailable (extracted text still returned)
}

# Supported modes
GET /api/documents/modes
```

### Supported file types (no extra packages)

- **Text/Docs**: `.txt` `.md` `.csv` `.log` `.yaml` `.yml` `.toml` `.ini` `.env`
- **Code**: `.js` `.ts` `.py` `.java` `.go` `.rs` `.cpp` `.c` `.sh` `.ps1` `.rb` `.php`
- **Data**: `.json` `.xml` `.html` `.css` `.sql` `.graphql`

### Optional enhanced support

```bash
npm install pdf-parse && echo "ENABLE_PDF=true" >> node/.env    # PDF
npm install mammoth   && echo "ENABLE_DOCX=true" >> node/.env   # Word docs
npm install xlsx      && echo "ENABLE_XLSX=true" >> node/.env   # Excel
```

Images (`.png` `.jpg` `.webp` etc.) are automatically routed to `nvidia/nemotron-3-nano-omni-9b` for visual analysis. Requires `NVIDIA_API_KEY`.

---

## Messaging Gateways

All gateways share the same Octopus task pipeline. Messages arrive on any platform, run through the agent chain, and the result is sent back.

### Quick setup summary

| Gateway | Env vars required | Install |
|---|---|---|
| Telegram | `TELEGRAM_BOT_TOKEN` | `npm install node-telegram-bot-api` |
| Discord | `DISCORD_BOT_TOKEN` | `npm install discord.js` |
| Slack | `SLACK_BOT_TOKEN` + `SLACK_APP_TOKEN` | `npm install @slack/bolt` |
| WhatsApp | *(none — QR scan on first run)* | `npm install @whiskeysockets/baileys qrcode-terminal` |
| Signal | `SIGNAL_PHONE` + `SIGNAL_CLI_PORT` | signal-cli daemon (Java required) |
| Home Assistant | `HA_URL` + `HA_TOKEN` | built-in (uses `ws` module) |

### Telegram

```env
TELEGRAM_BOT_TOKEN=7123456789:AAH...
TELEGRAM_ALLOWED_USERS=123456789,987654321   # optional: restrict access
```

```bash
npm install node-telegram-bot-api
```

Send `/ask <task>` to your bot, or any DM. Supports document uploads forwarded to analysis.

### Discord

```env
DISCORD_BOT_TOKEN=MTIzNDU2Nzg5...
DISCORD_TRIGGER_PREFIX=!octo               # default
DISCORD_LISTEN_ALL=false                   # true = respond to all messages
DISCORD_ALLOWED_GUILDS=123456789           # optional: restrict servers
```

```bash
npm install discord.js
```

Use `!octo <task>` or `@mention` the bot in any channel. Supports DMs and file attachments.

### Slack

```env
SLACK_BOT_TOKEN=xoxb-...
SLACK_APP_TOKEN=xapp-...    # requires Socket Mode enabled in Slack app settings
```

```bash
npm install @slack/bolt
```

`@mention` the bot or send a DM. Socket Mode — no public URL needed.

### WhatsApp

```env
WHATSAPP_SESSION_PATH=~/.octopus/wa_session   # default
WHATSAPP_TRIGGER_WORD=octo                     # messages must start with this (in group chats)
WHATSAPP_ALLOWED_NUMBERS=447700123456          # optional: restrict senders
```

```bash
npm install @whiskeysockets/baileys qrcode-terminal
```

On first run, scan the QR code shown in the terminal. Session is saved for automatic reconnect.

### Signal

```env
SIGNAL_PHONE=+447700123456
SIGNAL_CLI_HOST=127.0.0.1
SIGNAL_CLI_PORT=7583
SIGNAL_ALLOWED_SENDERS=+447700000001   # optional
```

Requires [signal-cli](https://github.com/AsamK/signal-cli) running as a TCP daemon:
```bash
signal-cli -u +447700123456 daemon --tcp 7583
```

### Gateway status API

```bash
GET /api/gateways
# { "gateways": { "telegram": { "online": true, "info": {...} }, ... } }

POST /api/gateways/telegram/send
{ "channel": "123456789", "text": "Hello from Octopus!" }
```

---

## Home Assistant

Octopus integrates with Home Assistant via the WebSocket API.

```env
HA_URL=http://homeassistant.local:8123
HA_TOKEN=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1...   # long-lived access token
HA_TRIGGER_EVENT=octopus_task                    # HA event type that triggers tasks
HA_RESULT_ENTITY=input_text.octopus_result       # entity to write result to
```

No extra packages needed — uses the `ws` module already installed.

### Example Home Assistant automation

```yaml
automation:
  alias: "Ask Octopus via command"
  trigger:
    platform: state
    entity_id: input_text.octopus_command
  action:
    event: octopus_task
    event_data:
      task: "{{ trigger.to_state.state }}"
```

When `input_text.octopus_command` changes, Octopus runs the task and writes the result back to `input_text.octopus_result`.

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

### AgentShield — 3 Layers

| Layer | Component | Cost | What it catches |
|---|---|---|---|
| 1 | PreToolUse hook | Zero tokens | `rm -rf`, `DROP DATABASE`, fork bombs |
| 2 | SecurityReviewer | LLM call | OWASP Top 10, secrets, injections |
| 3 | AgentShield gate | Zero tokens | 102-rule static scanner |

### 5-Layer Memory

```
L5  Task Context Profile  — ephemeral, per-agent call
L4  Prompt Cache          — Redis / in-memory fallback
L3  Run State             — SQLite, session-scoped
L2  Decision Memory       — SQLite append-only (ADRs)
L1  Structural Memory     — SQLite + NetworkX graph
```

---

## Configuration

### `node/.env` — all variables

| Variable | Default | Description |
|---|---|---|
| `LLM_PROVIDER` | `anthropic` | `anthropic` · `openai` · `google` · `ollama` · `nvidia` · `openrouter` · `huggingface` · `custom_http` · `router` |
| `LLM_MODEL` | provider default | Override model for that provider |
| `ANTHROPIC_API_KEY` | — | Anthropic Claude |
| `OPENAI_API_KEY` | — | OpenAI GPT-4o |
| `GOOGLE_API_KEY` | — | Google Gemini |
| `NVIDIA_API_KEY` | — | NVIDIA NIM (free trial: build.nvidia.com) |
| `OPENROUTER_API_KEY` | — | OpenRouter — 200+ models incl. Hermes (openrouter.ai) |
| `HF_TOKEN` | — | HuggingFace Inference API |
| `HEADLESS_MODE` | `false` | `true` = external LLM is planner |
| `SAFE_MODE` | `true` | `false` = enable file writes + shell |
| `AGENTSHIELD_MODE` | `advisory` | `none` · `advisory` · `gate` |
| `SOVEREIGN_FALLBACK_MODEL` | `gemma4:e2b` | Local fallback when cloud key missing |
| `CUSTOM_HTTP_URL` | — | OpenAI-compatible endpoint (vLLM, LM Studio, etc.) |
| `CUSTOM_HTTP_MODEL` | — | Model name for custom HTTP |
| `MAX_THINKING_TOKENS` | `10000` | Token cap per LLM call |
| `MEMORY_SERVICE_URL` | `http://localhost:5000` | Python memory service |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama server URL |
| `TELEGRAM_BOT_TOKEN` | — | Telegram gateway |
| `DISCORD_BOT_TOKEN` | — | Discord gateway |
| `SLACK_BOT_TOKEN` | — | Slack gateway |
| `SLACK_APP_TOKEN` | — | Slack Socket Mode token |
| `WHATSAPP_SESSION_PATH` | `~/.octopus/wa_session` | WhatsApp session directory |
| `SIGNAL_PHONE` | — | Signal phone number |
| `SIGNAL_CLI_PORT` | `7583` | signal-cli TCP port |
| `HA_URL` | — | Home Assistant URL |
| `HA_TOKEN` | — | Home Assistant long-lived token |
| `HA_TRIGGER_EVENT` | `octopus_task` | HA event type to listen for |
| `HA_RESULT_ENTITY` | — | HA entity to write results to |
| `SERP_API_KEY` | — | SerpAPI for Google web search results |
| `BRAVE_API_KEY` | — | Brave Search API |
| `ENABLE_PDF` | `false` | PDF extraction (needs `npm install pdf-parse`) |
| `ENABLE_DOCX` | `false` | Word doc extraction (needs `npm install mammoth`) |
| `ENABLE_XLSX` | `false` | Excel extraction (needs `npm install xlsx`) |
| `ROUTE_<ROLE>` | — | Override model router: `ROUTE_planner=nvidia:kimi-k2` |

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

Octopus now has a **full Gemini Live real-time voice interface** built into the web dashboard — inspired by and compatible with the Mark-XXXIX architecture by FatihMakes.

### Architecture

```
Browser frontend (Voice tab)
  ↕  WebSocket  ws://localhost:8765  (PCM audio + JSON control)
Python voice_service.py
  ↕  Gemini Live API  (real-time audio streaming + tool-calling)
  ↕  HTTP → localhost:3001  (Octopus Node.js API → 14 agents / 23 MCP tools)
```

### Quick Start

**1. Get a Gemini API key** (free tier works)
```
https://aistudio.google.com/apikey
```

**2. Add key to config**
```json
// config/api_keys.json
{ "gemini_api_key": "AIza..." }
// or: export GEMINI_API_KEY=AIza...
```

**3. Install voice dependencies**
```bash
pip install google-genai aiohttp websockets
```

**4. Start the voice service**
```bash
# macOS / Linux
./start_voice.sh

# Windows
.\start_voice.ps1

# Manual
python python/services/voice_service.py
```

**5. Open the dashboard → Voice tab → click Start Voice**

### What you can say

| Example | What happens |
|---|---|
| *"Review the security of the auth module"* | SecurityReviewer agent runs |
| *"Write a Redis cache wrapper in TypeScript"* | Forge agent generates code |
| *"What decisions have been recorded?"* | L2 Decision Memory fetched |
| *"Search memory for the graph_store"* | L1 Structural Memory queried |
| *"List all available agents"* | Agent roster returned |
| *"Plan a feature: JWT refresh tokens"* | Architect + Cortex plan |

### Voice UI Features

- **Animated orb** — colour and pulse reflects state (cyan = listening, amber = thinking, green = speaking, red = muted)
- **Hybrid input** — speak or type; both route to the same Gemini Live session
- **Full transcript log** — user speech, Octopus responses, and tool calls shown in real time
- **Auto-reconnect** — drops reconnect transparently every 5 s
- **Mute** — silences mic without ending the session

### Legacy text-only voice endpoint

```bash
curl -X POST http://localhost:3001/api/tasks/voice \
  -H "Content-Type: application/json" \
  -d '{"text": "summarize the last architectural decision"}'
```

Full guide: [docs/quickstart-voice.md](docs/quickstart-voice.md)

---

## LLM Providers

| Provider | Setting | Key | Models |
|---|---|---|---|
| Anthropic Claude | `anthropic` | `ANTHROPIC_API_KEY` | claude-sonnet-4-6, claude-opus-4-7 |
| OpenAI | `openai` | `OPENAI_API_KEY` | gpt-4o, gpt-4o-mini |
| Google Gemini | `google` | `GOOGLE_API_KEY` | gemini-2.0-flash, gemini-2.5-pro |
| Ollama (local) | `ollama` | none | gemma4:e2b, llama3.3, qwen2.5-coder |
| NVIDIA NIM | `nvidia` | `NVIDIA_API_KEY` (free) | 100+ models (build.nvidia.com) |
| OpenRouter | `openrouter` | `OPENROUTER_API_KEY` (free) | 200+ models incl. Hermes-3/4 |
| HuggingFace | `huggingface` | `HF_TOKEN` (free) | gemma-3-4b-it, llama-3.1-8b |
| Custom HTTP | `custom_http` | — | any OpenAI-compatible (vLLM, LM Studio) |
| Smart Router | `router` | varies | auto-routes per agent role |

**Sovereign Fallback:** if the active cloud provider has no key, Octopus automatically routes to local Ollama (`SOVEREIGN_FALLBACK_MODEL`, default `gemma4:e2b`) and logs a clear warning.

### Caller presets (`OCTOPUS_CALLER`)

```env
OCTOPUS_CALLER=claude       → anthropic / claude-sonnet-4-6
OCTOPUS_CALLER=nvidia       → nvidia / llama-3.1-405b-instruct
OCTOPUS_CALLER=nemotron     → nvidia / nemotron-ultra-253b-v1
OCTOPUS_CALLER=deepseek     → nvidia / deepseek-v4-pro
OCTOPUS_CALLER=kimi         → nvidia / kimi-k2-thinking
OCTOPUS_CALLER=qwen_coder   → nvidia / qwen3-coder-480b-a35b-instruct
OCTOPUS_CALLER=hermes3      → openrouter / hermes-3-llama-3.1-405b
OCTOPUS_CALLER=hermes4      → openrouter / hermes-4-405b
OCTOPUS_CALLER=hermes4_70b  → openrouter / hermes-4-llama-3.1-70b
```

---

## REST API Reference

### New in v4.0

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/search` | Web search: `{ query, limit?, engine? }` |
| `POST` | `/api/documents/upload` | Upload + analyse a file (multipart/form-data) |
| `GET` | `/api/documents/modes` | List supported analysis modes + extensions |
| `POST` | `/api/complete/stream` | SSE streaming LLM completion: `{ prompt, role?, maxTokens? }` |
| `GET` | `/api/gateways` | Gateway status |
| `POST` | `/api/gateways/:name/send` | Send message via gateway: `{ channel, text }` |
| `GET` | `/api/router` | Active task router model assignments |

### Core endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/health` | Server status + cache stats |
| `GET` | `/api/status` | Chain state, LLM provider, headless mode |
| `GET` | `/api/agents` | List all 14 registered agents |
| `POST` | `/api/tasks/plan` | Cortex plans; returns agent chain |
| `POST` | `/api/tasks/run` | Start full agent chain (events on WS) |
| `POST` | `/api/tasks/interrupt` | Stop running chain |
| `POST` | `/api/tasks/voice` | Voice path; emits `voice_summary` WS event |
| `POST` | `/api/security/scan` | AgentShield scan |
| `GET` | `/api/memory/search?q=` | L1 structural memory search |
| `GET` | `/api/memory/decisions` | L2 ADR log |
| `GET` | `/api/llm/provider` | Active LLM provider + model |
| `POST` | `/api/llm/complete` | Direct LLM completion |
| `GET` | `/api/tools/:format` | Tool declarations: `anthropic` `openai` `gemini` `mcp` |
| `GET` | `/api/plugins` | List tool plugins |
| `POST` | `/api/plugins/call/:name` | Call a tool plugin |
| `GET` | `/api/projects` | List projects |
| `POST` | `/api/projects` | Create project |
| `GET` | `/dashboard` | HUD dashboard (HTML) |
| `WS` | `/ws` | WebSocket event stream |

---

## WebSocket Events

| Event | Payload | Fired when |
|---|---|---|
| `connected` | `{}` | WS connection opens |
| `chain_start` | `{ task, plan: string[] }` | Agent chain begins |
| `agent_start` | `{ agent, role }` | Agent spawned |
| `agent_done` | `{ agent, approved, notes }` | Agent finished |
| `gate_fail` | `{ agent, reason }` | Gate blocked the chain |
| `chain_done` | `{ task, success, duration_ms }` | Chain complete |
| `voice_summary` | `{ summary, success }` | Voice task TTS result |
| `web_search` | `{ query, count }` | Web search ran |
| `document_upload` | `{ filename, mode }` | Document upload started |
| `document_done` | `{ filename, type, charCount }` | Document analysis complete |
| `gateway_message` | `{ gateway, sender, channel, text }` | Message arrived on any gateway |
| `gateway_reply` | `{ gateway, reply }` | Reply sent to a gateway |
| `instinct_new` | `{ id, pattern, confidence }` | New instinct learned |
| `compaction` | `{ session_tool_calls }` | Context compaction triggered |

---

## Testing

### Run the full test suite

```bash
cd node && npm test
```

### API test (20/20 passing)

```bash
cd node && node -e "
process.env.LLM_PROVIDER='ollama';
const req = require('supertest');
const app = require('./src/server');
(async()=>{
  const r = await req(app).get('/api/health');
  console.log(r.status === 200 ? '✓ health' : '✗ health');
  const r2 = await req(app).get('/api/router');
  console.log(r2.body.routes.length + ' routes loaded');
  const r3 = await req(app).get('/api/gateways');
  console.log('Gateways:', JSON.stringify(r3.body.gateways));
})();
"
```

---

## Development

```bash
# Start API + WebSocket + memory service
.\start_server.ps1        # Windows
./start_mcp.sh            # Mac/Linux

# CLI
node node/src/cli.js
❯ /plan add authentication
❯ /run  add authentication
❯ /provider set router       # enable multi-model routing
❯ /routes                    # see model assignments
❯ /dashboard                 # open HUD dashboard
❯ /vault                     # check API keys

# Run tests
cd node && npm test
cd python && python3 -m pytest tests/ -q
```

### Adding a gateway

1. Create `node/src/gateways/<name>.js` following the pattern in existing files
2. Add an entry to `GATEWAY_LOADERS` in `node/src/gateways/index.js`
3. The gateway auto-starts if its env var is set

### Adding a search engine

Edit `node/src/tools/web_search.js` → add engine function and register in the dispatcher.

---

## MCP Tool Catalogue — 26 Tools

**Orchestration:** `octopus_plan_task` · `octopus_run_task_chain`

**Memory:** `octopus_search_memory` · `octopus_get_decisions` · `octopus_compact_session`

**Files & Shell:** `octopus_read_file` · `octopus_write_file` · `octopus_execute_command`

**Agents & Security:** `octopus_create_agent` · `octopus_scan_security`

**LLM:** `octopus_llm_complete`

**Browser:** `octopus_browser_navigate` · `octopus_browser_snapshot` · `octopus_browser_interact`

**Skills:** `octopus_skill_scout` · `octopus_skill_synthesize` · `octopus_skill_validate` · `octopus_skill_deploy` · `octopus_skill_retire` · `octopus_skill_list`

**Auth + Diagnostics:** `octopus_login` · `octopus_vault_check` · `octopus_memory_status` · `octopus_task_routes`

**Plugins:** `octopus_plugin_list` · `octopus_plugin_call`

---

## Uninstall

```powershell
# Windows PowerShell
$RepoDir = "C:\path\to\Octopus-Agent-System"
Push-Location "$RepoDir\node"; npm unlink --silent; Pop-Location

# Remove API keys from OS Vault
$providers = @('anthropic','openai','google','nvidia','openrouter','huggingface')
foreach ($p in $providers) {
    try {
        $vault = New-Object Windows.Security.Credentials.PasswordVault
        $cred = $vault.Retrieve("Octopus_Vault", $p)
        $vault.Remove($cred)
        Write-Host "Removed $p"
    } catch {}
}
Write-Host "Done. Delete the repo folder to remove all files."
```

---

## Attribution

| Component | License | Source |
|---|---|---|
| Octopus Agent System (`node/`, `python/`) | Apache 2.0 | [Boyapati13/Octopus-Agent-System](https://github.com/Boyapati13/Octopus-Agent-System) |
| AgentDeck (`bridge/`, Android, Apple, ESP32…) | MIT | [puritysb/AgentDeck](https://github.com/puritysb/AgentDeck) |
| Hermes Models (NousResearch) | Apache 2.0 | [NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent) |
| Mark-XXXIX HUD Design (inspiration) | MIT | [FatihMakes/Mark-XXXIX](https://github.com/FatihMakes/Mark-XXXIX) |
| ECC Skills integration | Apache 2.0 | [affaan-m/everything-claude-code](https://github.com/affaan-m/everything-claude-code) |

**Independent project. Not affiliated with Anthropic, OpenAI, Google, NVIDIA, NousResearch, Elgato, or any messaging platform.**
