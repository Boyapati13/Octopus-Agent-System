<p align="center">
  <img src="docs/media/agentdeck-icon.png" width="150" alt="OCTO — Octopus Agent System">
</p>

<h1 align="center">🐙 Octopus Agent System</h1>
<h3 align="center">O.C.T.O — Optimized Cognitive Task Orchestrator · v4.5</h3>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache%202.0-blue.svg"></a>
  <img src="https://img.shields.io/badge/version-4.5.0-brightgreen.svg">
  <img src="https://img.shields.io/badge/agents-15%20specialist-blue.svg">
  <img src="https://img.shields.io/badge/LLM%20providers-8-blueviolet.svg">
  <img src="https://img.shields.io/badge/gateways-6%20platforms-cyan.svg">
  <img src="https://img.shields.io/badge/voice-Gemini%20%7C%20Windows%20TTS-orange.svg">
</p>

<p align="center">
  <img src="https://img.shields.io/badge/node-%3E%3D18-green.svg">
  <img src="https://img.shields.io/badge/python-%3E%3D3.11-yellow.svg">
  <img src="https://img.shields.io/badge/PyQt6-native%20desktop-cyan.svg">
  <img src="https://img.shields.io/badge/Windows-full%20control-blue.svg">
  <img src="https://img.shields.io/badge/Ollama-sovereign%20fallback-gray.svg">
</p>

---

> **Fully autonomous AI agent system with a native PyQt6 desktop HUD, real-time voice (Gemini native audio or free Windows TTS), complete Windows control (PowerShell/CMD/Bash), persistent local memory, 15 specialist agents, 8-provider LLM routing, browser automation, document analysis (PDF/images/video/audio), and 6 messaging platform gateways.**

---

## Quick Start — One Command

```powershell
# Install Python dependencies (one time)
pip install PyQt6 sounddevice google-genai pyttsx3 SpeechRecognition requests psutil pyautogui playwright pillow

# Install browser engine for automation (one time)
py -m playwright install chromium

# Launch OCTO desktop
py desktop\octo_desktop.py
```

That's it. OCTO starts automatically with:
- Native PyQt6 HUD window with animated radar, live system metrics
- Octopus agent server on `http://localhost:3001`
- Voice (Windows TTS + Google STT — no API key needed)
- All 20+ tools ready: terminal, browser, documents, memory, agents

---

## How to Launch — 3 Modes

### Mode 1: Native Desktop App (Recommended)

The full OCTO experience — native PyQt6 HUD with voice, tools, and agents.

```powershell
py desktop\octo_desktop.py
```

**Auto-detects voice mode:**
- If `gemini_api_key` set → Gemini native live audio (real-time, low-latency)
- Otherwise → Windows TTS (David/Zira) + Google free STT — **works with zero API keys**

**Push-to-talk:** Click **MICROPHONE ACTIVE** button → speak for 6 seconds → OCTO responds.

---

### Mode 2: Web Dashboard Only

```powershell
node node\src\server.js
```

Open **http://localhost:3001** — full HUD dashboard with all tabs (Log, Convo, Search, Docs, Gates, Router, Events).

---

### Mode 3: CLI Terminal

```powershell
node node\src\cli.js
```

---

## API Keys — What You Need

Edit **`desktop/config/api_keys.json`** for the desktop app:

```json
{
  "gemini_api_key":      "",
  "anthropic_api_key":   "",
  "nvidia_api_key":      "",
  "openrouter_api_key":  "",
  "hf_token":            "",
  "text_llm_provider":   "auto",
  "os_system":           "windows"
}
```

Edit **`node/.env`** for the server + agents:

```env
LLM_PROVIDER=ollama
LLM_MODEL=gemma4:e2b
ANTHROPIC_API_KEY=
NVIDIA_API_KEY=
TELEGRAM_BOT_TOKEN=
```

**Nothing is required.** Ollama is the sovereign fallback — OCTO works fully offline with no API keys at all.

### Provider Priority (auto mode)

```
Anthropic → NVIDIA NIM (free) → OpenRouter/Hermes → Gemini → HuggingFace → Ollama
```

| Provider | Best For | Free? | Key Source |
|---|---|---|---|
| `ollama` | Privacy, offline, zero cost | Free | `ollama pull gemma4:e2b` |
| `nvidia` | Best free cloud (Nemotron 253B, Qwen3-Coder 480B) | Free tier | build.nvidia.com |
| `openrouter` | Hermes-3/4 agentic models | Pay-as-go | openrouter.ai |
| `anthropic` | Claude Sonnet — best reasoning | Paid | console.anthropic.com |
| `gemini` | Native live audio voice | Free tier | aistudio.google.com |
| `huggingface` | Open models | Free tier | huggingface.co |

---

## What OCTO Can Do

### Voice — Talk to OCTO

| Mode | How |
|---|---|
| Gemini live audio | Set `gemini_api_key` → full real-time streaming voice |
| Free (no key) | Click MICROPHONE ACTIVE → speak → Windows TTS replies |

OCTO hears you say:
- `"Open Chrome and go to GitHub"` → browser_control
- `"Install numpy with pip"` → run_terminal (PowerShell)
- `"What's running on port 3001?"` → run_terminal
- `"Summarize this PDF"` → file_processor
- `"Remember I work at Google"` → save_memory
- `"What do you know about me?"` → recall_memory
- `"Review my code and add tests"` → octopus_agent (15-agent pipeline)

---

### Windows Terminal — Full Control

OCTO runs any command in any shell:

```
"run my script"           → py script.py (Python)
"install requests"        → pip install requests (PowerShell)
"what processes are up"   → Get-Process (PowerShell)
"check disk space"        → Get-PSDrive
"git pull origin master"  → git pull (PowerShell)
"start the dev server"    → npm start
"ping google"             → ping google.com (CMD)
"list open ports"         → netstat -an
"kill process X"          → Stop-Process -Name X
"run my bash script"      → bash script.sh (Git Bash)
```

Shell selector: `powershell` (default) · `cmd` · `bash` · `python`

---

### Persistent Local Memory

OCTO remembers everything you tell it across restarts:

```
"My name is Boyapati"          → saved: identity/name
"I prefer dark mode"           → saved: preferences/dark_mode
"I'm building an AI agent"     → saved: projects/ai_agent
"My sister is called Priya"    → saved: relationships/sister
```

Memory is injected into every session prompt automatically.
Ask `"what do you remember about me?"` to see everything.

Memory file: `desktop/memory/long_term.json`
Categories: `identity` · `preferences` · `projects` · `relationships` · `wishes` · `notes`

---

### Browser Automation

Real Playwright browser (Chrome/Edge/Firefox) with your actual profiles and cookies:

```
"Open GitHub and go to my repos"
"Search for the latest Python news on Google"
"Click the Sign In button on the page"
"Fill in the form with test@example.com"
"Scrape the pricing table from this URL"
"Get the text from the current page"
"Close the browser"
```

---

### Document Analysis

Drop any file onto OCTO — it reads, analyzes, converts:

| Type | Actions |
|---|---|
| PDF | summarize, extract_text, to_word, info |
| Images (JPG/PNG/WebP) | describe, ocr, analyze, resize, compress, convert |
| Word/DOCX | summarize, fix grammar, reformat, word count |
| Excel/CSV | analyze, stats, filter, sort, convert |
| Audio (MP3/WAV/FLAC) | transcribe, trim, convert, info |
| Video (MP4/AVI/MKV) | trim, extract_audio, extract_frame, compress, info |
| Code (any language) | explain, review, fix, optimize, run, test, document |
| Archives (ZIP/RAR) | list, extract |

Vision-capable: images analyzed with Gemini when key is set, text LLM fallback otherwise.

---

### 15-Agent Coding Pipeline

Say `"review my code"` or `"add tests to my project"` → OCTO routes to the full pipeline:

```
Cortex (planner) → Atlas (memory) → Architect → Forge (implement)
→ Reviewer (GATE) → SecurityReviewer (OWASP, GATE)
→ Probe (tests) → FactChecker → Scribe (docs) → ReleaseKeeper (GATE)
```

Each GATE blocks the chain if it finds critical issues.

**Additional specialist agents dispatched by Cortex based on task type:**

| Agent | Role |
|---|---|
| Navigator | Web research and URL traversal via Playwright |
| SystemAgent | Windows desktop automation (mouse, keyboard, processes, windows) |
| MarketScout | Phase 1 of Skill Evolution — scans npm/PyPI/GitHub for skill opportunities |
| Toolsmith | Phase 2 — synthesises a working MCP skill from package docs using the LLM |
| SandboxQA | Phase 3 — validates auto-generated skills in isolated worker threads, self-corrects via Toolsmith (max 3 retries), approves for deployment |

**Skill Evolution Pipeline** (`"evolve skills"` or `"add a new tool for X"`):

```
MarketScout (scout) → Toolsmith (synthesise) → SandboxQA (validate + deploy)
```

SandboxQA runs each generated skill in a sandboxed `worker_thread` with a 10 s hard timeout and memory limits. On failure it loops back to Toolsmith automatically.

**Dynamic routing** — Cortex reads the task and selects which agents to chain at runtime. New agents can be registered at any point via `injectAgent()` without a server restart.

---

### Messaging Gateways

OCTO receives tasks from 6 platforms and replies there:

| Platform | What to set |
|---|---|
| Telegram | `TELEGRAM_BOT_TOKEN` + `TELEGRAM_HOME_CHANNEL` |
| Discord | `DISCORD_TOKEN` + `DISCORD_HOME_CHANNEL` |
| Slack | `SLACK_BOT_TOKEN` + `SLACK_APP_TOKEN` |
| WhatsApp | `WHATSAPP_SESSION_PATH` (QR scan on first use) |
| Signal | `SIGNAL_PHONE` + Signal CLI |
| Home Assistant | `HA_URL` + `HA_TOKEN` |

---

## Desktop App Structure

```
desktop/
├── octo_desktop.py          ← LAUNCH THIS — single entry point
├── main.py                  ← OctoLive voice backend (Gemini or free)
├── ui.py                    ← Native PyQt6 HUD (1500 lines)
├── requirements.txt         ← pip dependencies
├── config/
│   └── api_keys.json        ← all provider keys
├── core/
│   ├── text_llm.py          ← 8-provider LLM adapter
│   ├── voice_free.py        ← Windows TTS + Google STT backend
│   └── prompt.txt           ← OCTO system prompt
├── actions/
│   ├── terminal.py          ← PowerShell / CMD / Bash / Python
│   ├── browser_control.py   ← Playwright browser automation
│   ├── file_processor.py    ← PDF / image / video / audio / code
│   ├── computer_settings.py ← volume, brightness, WiFi, power
│   ├── computer_control.py  ← mouse, keyboard, clipboard
│   ├── screen_processor.py  ← screen capture + vision
│   ├── code_helper.py       ← write / run / explain code
│   ├── dev_agent.py         ← build full projects from scratch
│   ├── octopus_bridge.py    ← HTTP bridge to 15-agent pipeline
│   ├── web_search.py        ← DuckDuckGo / Brave / SERP
│   ├── send_message.py      ← WhatsApp / Telegram messaging
│   ├── reminder.py          ← Windows Task Scheduler
│   ├── youtube_video.py     ← play / summarize / trending
│   ├── weather_report.py    ← current weather via wttr.in
│   ├── flight_finder.py     ← Google Flights scraper
│   └── game_updater.py      ← Steam / Epic game management
├── agent/
│   ├── planner.py           ← multi-step task planning
│   ├── executor.py          ← step-by-step execution with error recovery
│   ├── error_handler.py     ← RETRY / SKIP / ABORT / FIX decisions
│   └── task_queue.py        ← async priority task queue
└── memory/
    └── memory_manager.py    ← persistent JSON memory (all categories)
```

---

## Server Structure

```
node/src/
├── server.js          ← REST API + WebSocket + all gateways
├── cli.js             ← Interactive terminal
├── llm.js             ← 8-provider LLM gateway + sovereign fallback
├── runner.js          ← Multi-agent pipeline executor
├── task_router.js     ← Per-role model routing (ROUTE_* env vars)
│                         Routes each agent to a specialist model:
│                         planner→Nemotron 253B, forge→Qwen3-Coder 480B,
│                         security→Llama-3.3-70B, verify→Phi-4-128K, etc.
│                         Override any route: ROUTE_<ROLE>=<provider>:<model>
├── octo_memory.js     ← Rolling session memory (L6)
├── MASTER_PROMPT.md   ← Full autonomous agent persona
├── agents/            ← 15 specialist agents (cortex, atlas, architect, forge,
│                         reviewer, securityReviewer, factChecker, probe, scribe,
│                         releaseKeeper, navigator, marketScout, toolsmith,
│                         sandboxQA, systemAgent)
│                         injectAgent() registers new agents at runtime
├── gateways/          ← Telegram, Discord, Slack, WhatsApp, Signal, HA
├── tools/             ← MCP tool implementations
└── frontend/          ← Web HUD (index.html + js/ + css/)
```

---

## REST API

```
GET  /api/health          — server status, provider, model
GET  /api/status          — active chains, projects, agents
POST /api/tasks/run       — full 15-agent pipeline
POST /api/tasks/ask       — fast Q&A (search + LLM, ~3s)
POST /api/tasks/interrupt — stop running chain
POST /api/tasks/self-code — patch own source files (reads all .js in src/,
                            agents/, gateways/, tools/ dynamically)
GET  /api/projects        — list all projects
POST /api/search          — web search
POST /api/documents/upload — analyze uploaded file
GET  /api/gateways        — gateway status
WS   /ws                  — WebSocket event stream
```

**HEADLESS_MODE** — set `HEADLESS_MODE=true` in `node/.env` to disable Cortex auto-planning. In this mode external LLMs (e.g. Claude, GPT) act as the planner and call `octopus_*` tools directly. Chain execution and self-code endpoints are gated off.

---

## What's New in v4.5

### Web Dashboard — Keyboard Navigation & Accessibility (PR #5)
- **Enter / Ctrl+Enter** on the command console input now fires the Run button — no mouse click needed
- **`aria-label`** added to the command input (`"Octopus Command Console Query Input"`)
- **`aria-describedby`** wired to a screen-reader-only hint (`"Press Enter to run the command"`)
- **Focus-visible rings** (`focus-visible:ring-2 focus-visible:ring-cyan-400`) on the input for keyboard navigation users
- **Micro-interaction** on the Run button — `scale-95 / opacity-80` for 100 ms on press

### Architecture Hardening (PR #4)
- **`octopus_bridge.py`** — eliminated global `PROJECT_ID` state leak; improved connection-polling error handling
- **`text_llm.py`** — updated `HTTP-Referer` and `X-Title` headers to unified `OCTO` branding across all providers
- **`node/.env` writes** — token files now written with mode `0600`; template-appending bug fixed in `setup-api.js`
- **Telegram gateway** — rate-limiter `Map` entries are now deleted after use, preventing unbounded memory growth

### Self-Code Full Directory Indexing (PR #4)
- `POST /api/tasks/self-code` now dynamically reads every `.js` file in `src/`, `src/agents/`, `src/gateways/`, and `src/tools/` instead of a hardcoded five-file allowlist — the self-improvement engine can now patch any agent or gateway file

---

## What's New in v4.4

- **Full Windows terminal control** — PowerShell, CMD, Bash, Python via `run_terminal` tool
- **Persistent local memory** — facts saved to `desktop/memory/long_term.json`, survives restarts
- **recall_memory tool** — ask OCTO what it knows about you, filter by keyword
- **Voice push-to-talk fixed** — COM thread init bug fixed, click mic button to record
- **Setup screen restored** — placeholder API keys no longer bypass setup overlay
- **Browser/docs path fixed** — double-nested actions/ directory bug resolved
- **file_processor** — deprecated google.generativeai replaced with graceful text_llm fallback
- **OCTO branding complete** — all J.A.R.V.I.S / MARK XXXIX references replaced

## What's New in v4.3

- **Native desktop app** — `desktop/octo_desktop.py` launches PyQt6 HUD with embedded Octopus dashboard
- **Multi-provider text LLM** — `desktop/core/text_llm.py` routes through 8 providers automatically
- **Free voice backend** — Windows TTS (pyttsx3) + Google STT when no Gemini key
- **Octopus bridge** — `desktop/actions/octopus_bridge.py` routes coding commands to 15-agent pipeline
- **MASTER_PROMPT.md** — full autonomous agent persona injected into every agent call
- **Provider label** — `/api/health` now returns `provider` + `model`, shown in dashboard sidebar

## What's New in v4.2

- **Wake word** — "Hello Octo" activates voice without clicking
- **Voice selector** — choose David / Zira / Mark from dropdown
- **Persistent session memory** — `data/octo_memory.json` stores Q&A and facts
- **Self-coding** — `POST /api/tasks/self-code` to patch its own source files
- **Home Channel** — Telegram home channel for proactive answer delivery
- **WhatsApp fixed** — Baileys v6.7 singleton, no boot crash, correct QR flow

---

## Troubleshooting

| Problem | Fix |
|---|---|
| Voice not working | Click MICROPHONE ACTIVE, speak clearly for 6s. Check mic permissions in Windows Settings |
| Setup screen not showing | Delete `desktop/config/api_keys.json` and relaunch |
| Ollama not responding | Run `ollama serve` in a terminal. Check port 11434 |
| Server already on 3001 | `octo_desktop.py` finds and uses the running server automatically |
| Browser tools fail | Run `py -m playwright install chromium` once |
| PDF analysis needs PyPDF2 | `pip install PyPDF2` |
| Telegram bot offline | Check `TELEGRAM_BOT_TOKEN` in `node/.env` |
| Tasks stuck on "Working..." | Click KILL button, check LLM provider in Setup tab |
| No GPU acceleration | Ollama uses CPU — try `qwen2.5-coder:1.5b-base` (faster, smaller) |

---

<p align="center">
  <strong>Octopus Industries · OCTO v4.5 · CLASSIFIED</strong><br>
  <a href="https://github.com/Boyapati13/Octopus-Agent-System">GitHub</a>
</p>
