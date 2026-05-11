# 🐙 Octopus 2.0 — Sovereign Edition

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![Tests](https://img.shields.io/badge/tests-72%20passing-brightgreen)](#testing)
[![Agents](https://img.shields.io/badge/agents-14-blue)](#agents)
[![Tools](https://img.shields.io/badge/MCP%20tools-23-purple)](#mcp-tools)
[![AgentShield](https://img.shields.io/badge/AgentShield-102%20rules-red)](#agentshield)
[![Zero-Key](https://img.shields.io/badge/Auth-Zero--Key%20Vault-success)](#zero-key-authentication)
[![Ollama](https://img.shields.io/badge/Ollama-6%20models%20detected-blue)](#ollama--local-models)
[![Cross-Market](https://img.shields.io/badge/MCP-Universal%20Registry-orange)](#cross-market-universal-mcp)

A **self-evolving**, **continuously-learning** multi-agent AI system. Sovereign Edition adds Zero-Key OS Vault auth, a Cross-Market Universal MCP adapter registry, caller-aware LLM routing, and Sovereign Fallback to local Ollama when no cloud key is present.

Works with **Claude · GPT-4o · Gemini · Ollama** (local, no API key). Connects to Claude Desktop, Claude Code, Cursor, Windsurf, Continue.dev, and any MCP-compatible client automatically.

---

## What's New — Sovereign Edition

| Feature | Description |
|---|---|
| **23 MCP Tools** | Added `octopus_login`, `octopus_vault_check`, `octopus_memory_status` |
| **Zero-Key Auth** | `octopus_login` stores keys in OS Vault — no `.env` editing, ever |
| **4-Tier Key Cascade** | OS Vault → CLI Session → Process Env → .env fallback |
| **Sovereign Fallback** | No cloud key? Auto-routes to local Ollama `gemma4:e2b` |
| **Caller-Aware Routing** | `OCTOPUS_CALLER` env picks the right model per connected AI |
| **Cross-Market Adapters** | `npm run cross-link` syncs 6 adapter files from one source of truth |
| **Ollama Live Detection** | `adapters/ollama-config.json` built from your actual installed models |
| **Self-Healing Startup** | `start_mcp.ps1` auto-installs missing deps, detects `py` launcher |
| **Python 3.14 / Windows** | Uses `py` launcher throughout — works with Python 3.14.x |
| **Interactive Login Menu** | `vault_login.js` — enquirer select + masked password, 3 providers + Vertex/Bedrock guide |

---

## Install in One Line

**Windows (PowerShell)**
```powershell
powershell -ExecutionPolicy Bypass -Command "iex (irm https://raw.githubusercontent.com/Boyapati13/Octopus-Agent-System/master/install.ps1)"
```

**Mac / Linux**
```bash
curl -sSL https://raw.githubusercontent.com/Boyapati13/Octopus-Agent-System/master/install.sh | bash
```

The installer:
- Clones the repo into `~/Octopus-Agent-System`
- Installs all Node + Python dependencies (`keytar`, `enquirer`, `chalk` included)
- Auto-detects Ollama and pre-configures `LLM_PROVIDER=ollama`
- Writes `node/.env` — **no API keys in the file** (use `octopus_login` instead)
- Registers Octopus with every detected client: Claude Desktop, Claude Code, Cursor, Windsurf, Continue.dev
- Bootstraps `.claude/rules/` ECC guardrail files
- Linux: detects and prompts to install `libsecret-1-dev` for OS Vault support

Restart your AI client after running — all 23 tools appear automatically.

---

## Start the Stack

**Windows (Self-Healing)**
```powershell
.\start_mcp.ps1
```

**Mac / Linux**
```bash
./start_mcp.sh
```

Both scripts run a **vault pre-flight check** (migrates plain-text `.env` keys to the OS Vault), start the Python memory service on port 5000, and launch the MCP server. `start_mcp.ps1` also auto-installs missing Node dependencies.

Or start individually:
```bash
# Terminal 1 — Python memory service
py python/services/memory_service.py      # Windows
python3 python/services/memory_service.py # Mac/Linux

# Terminal 2 — MCP server
cd node && npm run mcp

# Terminal 3 — REST API (optional)
cd node && npm run serve
```

---

## Connect to Your AI

The installer auto-registers Octopus with every detected client. For manual setup, add the config below — replace `YOUR_INSTALL_PATH` with your clone directory.

> **Windows JSON paths** need double backslashes: `C:\\Users\\You\\Octopus-Agent-System`

### Claude Desktop
**Config:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "octopus-2": {
      "command": "node",
      "args": ["YOUR_INSTALL_PATH\\node\\src\\mcp.js"],
      "env": {
        "SAFE_MODE": "false",
        "MAX_THINKING_TOKENS": "10000",
        "AGENTSHIELD_MODE": "advisory",
        "PROJECT_ROOT": "YOUR_INSTALL_PATH",
        "ECC_RULES_PATH": "YOUR_INSTALL_PATH\\.claude\\rules",
        "MEMORY_SERVICE_URL": "http://localhost:5000",
        "LLM_PROVIDER": "ollama",
        "LLM_MODEL": "gemma4:e2b",
        "OLLAMA_BASE_URL": "http://localhost:11434",
        "OCTOPUS_CALLER": "claude"
      }
    }
  }
}
```
**After saving:** fully restart Claude Desktop.

---

### Claude Code
**Config:** `%USERPROFILE%\.claude\settings.json` (Mac: `~/.claude/settings.json`)

```json
{
  "mcpServers": {
    "octopus-2": {
      "command": "node",
      "args": ["YOUR_INSTALL_PATH/node/src/mcp.js"],
      "env": {
        "SAFE_MODE": "false",
        "MAX_THINKING_TOKENS": "10000",
        "AGENTSHIELD_MODE": "advisory",
        "PROJECT_ROOT": "YOUR_INSTALL_PATH",
        "ECC_RULES_PATH": "YOUR_INSTALL_PATH/.claude/rules",
        "MEMORY_SERVICE_URL": "http://localhost:5000",
        "LLM_PROVIDER": "ollama",
        "LLM_MODEL": "gemma4:e2b",
        "OLLAMA_BASE_URL": "http://localhost:11434",
        "OCTOPUS_CALLER": "claude"
      }
    }
  }
}
```
Type `/mcp` to verify the server connected. No restart needed.

---

### Cursor
**Config:** `%APPDATA%\Cursor\User\globalStorage\mcp.json` (Mac: `~/.cursor/mcp.json`)

Or copy `adapters/cursor-mcp.json` directly — kept in sync by `npm run cross-link`.

```json
{
  "mcpServers": {
    "octopus-2": {
      "command": "node",
      "args": ["YOUR_INSTALL_PATH/node/src/mcp.js"],
      "env": {
        "SAFE_MODE": "false",
        "MAX_THINKING_TOKENS": "10000",
        "PROJECT_ROOT": "YOUR_INSTALL_PATH",
        "MEMORY_SERVICE_URL": "http://localhost:5000",
        "LLM_PROVIDER": "anthropic",
        "OCTOPUS_CALLER": "cursor"
      }
    }
  }
}
```
**After saving:** Cursor → Settings → MCP → Reload.

---

### Windsurf
**Config:** `~/.codeium/windsurf/mcp_config.json`

```json
{
  "mcpServers": {
    "octopus-2": {
      "command": "node",
      "args": ["YOUR_INSTALL_PATH/node/src/mcp.js"],
      "env": {
        "SAFE_MODE": "false",
        "MAX_THINKING_TOKENS": "10000",
        "PROJECT_ROOT": "YOUR_INSTALL_PATH",
        "MEMORY_SERVICE_URL": "http://localhost:5000",
        "LLM_PROVIDER": "ollama",
        "LLM_MODEL": "gemma4:e2b"
      }
    }
  }
}
```
Reload Windsurf after saving.

---

### Continue.dev
**Config:** `~/.continue/config.json`

```json
{
  "mcpServers": [
    {
      "name": "octopus-2",
      "command": "node",
      "args": ["YOUR_INSTALL_PATH/node/src/mcp.js"],
      "env": {
        "SAFE_MODE": "false",
        "MAX_THINKING_TOKENS": "10000",
        "PROJECT_ROOT": "YOUR_INSTALL_PATH",
        "MEMORY_SERVICE_URL": "http://localhost:5000",
        "LLM_PROVIDER": "ollama",
        "LLM_MODEL": "gemma4:e2b"
      }
    }
  ]
}
```
`Ctrl+Shift+P` → **Continue: Reload** after saving.

---

### Verify
In any connected client:
```
octopus_vault_check
```
Returns vault key status per provider, Ollama health, and whether Sovereign Fallback is active.

---

## Cross-Market Universal MCP

Octopus runs as a standard MCP stdio server — any MCP-compatible client can connect. A Universal Adapter Registry in `global-config/` and `adapters/` stays in sync with one command:

```bash
cd node && npm run cross-link
```

Reads `node/src/tools.js` and regenerates all 6 adapter files:

| File | Use with |
|---|---|
| `global-config/universal-mcp.json` | Any MCP client — standard server manifest |
| `global-config/claude-plugin/plugin.json` | Claude Code integration descriptor |
| `adapters/openai-functions.json` | OpenAI Assistants API / Chat Completions `tools` param |
| `adapters/gemini-tools.json` | Gemini API `functionDeclarations` + Gemini CLI config |
| `adapters/cursor-mcp.json` | Cursor `mcpServers` registration block |
| `adapters/ollama-config.json` | Ollama model registry — built from your live Ollama instance |

> **ChatGPT Desktop** does not support MCP. Use `adapters/openai-functions.json` with the OpenAI API directly.

---

## Caller-Aware Routing

Set `OCTOPUS_CALLER` in any MCP client's `env` block. Octopus auto-selects provider + model for that AI:

| `OCTOPUS_CALLER` | Provider | Model | Key needed |
|---|---|---|---|
| `claude` | Anthropic | `claude-sonnet-4-6` | Yes (or Sovereign Fallback) |
| `openai` | OpenAI | `gpt-4o` | Yes (or Sovereign Fallback) |
| `gemini` | Google | `gemini-2.5-pro` | Yes (or Sovereign Fallback) |
| `ollama` | Ollama | `gemma4:e2b` | **No** — fully local |
| `cursor` / `windsurf` / `continue` | Uses `LLM_PROVIDER` env | Uses `LLM_MODEL` env | Depends |
| *(unset)* | Uses `LLM_PROVIDER` env | Uses `LLM_MODEL` env | Depends |

**Sovereign Fallback** is always active: if the selected provider has no key in the Vault, the call automatically routes to local Ollama `gemma4:e2b` with no error.

---

## Zero-Key Authentication

API keys never live in `.env`. The `getSecureKey` cascade retrieves them at runtime:

```
1. OS Vault      keytar → Windows Credential Manager / macOS Keychain / Linux Secret Service
2. CLI Session   ~/.octopus/sessions.json  (cross-platform fallback when keytar unavailable)
3. Process Env   externally set or sourced before start
4. .env fallback node/.env plain-text (last resort)
```

### Authorize a provider — first time only

In any AI chat:
```
octopus_login
```

An interactive menu opens (provider select + masked key input). Choose your provider, paste the key — it's stored in the OS Vault immediately. No `.env` changes.

**Migrate existing `.env` keys:** run `.\start_mcp.ps1` — the pre-flight check detects plain-text keys and offers automatic migration.

---

## Ollama / Local Models

Octopus runs entirely on local models — no API key, no cloud cost.

### Detected models on this machine

| Model | Size | Tool calling | Best for |
|---|---|---|---|
| `kimi-k2.6:cloud` | 1T (cloud proxy) | ✅ | **Best Cortex planning**, complex task chains |
| `nemotron-3-super:cloud` | cloud proxy | ✅ | Nvidia Nemotron quality via Ollama |
| `glm-4.7-flash:latest` | 29.9 GB | ✅ | Best **local** quality — all agents |
| `gemma4:e2b` | 7.2 GB | ✅ | **Default + Sovereign Fallback** — fast, all agents |
| `qwen2.5-coder:7b` | 4.7 GB | ✅ | Forge, Reviewer, SandboxQA — coding tasks |
| `qwen2.5-coder:1.5b-base` | 1.0 GB | ❌ | Fast iteration, simple chains |

Pull additional models any time:
```bash
ollama pull gemma4:9b          # Complex planning (~9 GB)
ollama pull llama3.2           # Minimal footprint (~2 GB)
```

After pulling, re-run `npm run cross-link` to update `adapters/ollama-config.json`.

Switch model without restarting any service:
```env
LLM_PROVIDER=ollama
LLM_MODEL=kimi-k2.6:cloud      # best quality (cloud via Ollama)
LLM_MODEL=glm-4.7-flash:latest # best local quality
LLM_MODEL=gemma4:e2b           # default
LLM_MODEL=qwen2.5-coder:7b     # coding tasks
```

### Open WebUI (Ollama browser UI with MCP)
Go to **Admin → Tools → Add MCP Server** and paste the `open_webui_mcp` block from `adapters/ollama-config.json`.

---

## 🛡️ AgentShield — 3-Layer Security

```
Layer 1  PreToolUse hook       synchronous, 0 tokens   Blocks rm -rf, fork bombs, DROP DATABASE
Layer 2  SecurityReviewer      OWASP Top 10            Quick patterns + AgentShield 5-category scan
Layer 3  AgentShield gate      102 static rules        AGENTSHIELD_MODE=gate blocks on critical findings
```

| Category | Rules | Catches |
|---|---|---|
| AS-S Secrets | 14 | Hardcoded API keys, private keys, connection strings |
| AS-P Permissions | 20 | `eval()`, `new Function()`, `__proto__`, `chmod 777` |
| AS-H Hook injection | 15 | `$()` in hooks, unescaped `execSync`, `eval` in PreToolUse |
| AS-M MCP risk | 15 | `autoApprove:true`, raw shell transport, system root paths |
| AS-A Agent config | 15 | Path traversal in agentName, unconditional `approved:true` |
| AS-Q Code quality | 23 | `console.log`, `var`, `any`, empty catch, `innerHTML=` |

```env
AGENTSHIELD_MODE=none      # disabled
AGENTSHIELD_MODE=advisory  # log findings, don't block (default)
AGENTSHIELD_MODE=gate      # block pipeline on any critical finding
```

---

## Architecture

### 5-Layer Memory + Instincts

```
L5  Task Context Profile  ephemeral — rebuilt per agent per call
                          Priority: OCTOPUS.md → ECC Rules → Instincts → L1-L3
L4  Prompt Cache          Redis (optional) · MD5-keyed, auto-invalidates on rule change
L3  Run State             SQLite — session log + compaction records
L2  Decision Memory       SQLite — ADRs + instincts table (confidence-weighted)
L1  Structural Memory     SQLite graph + NetworkX runtime reasoning
```

### Self-Evolving Skill Marketplace

```
ECC library (195+ skills) → npm/PyPI/GitHub → Toolsmith → SandboxQA → Cortex → Active Registry
```

### Cortex Planning Patterns

```
Default         Atlas → Architect → Forge → [QA gates] → Scribe → ReleaseKeeper
TDD-first       Atlas → Probe (write tests) → Forge → [QA gates] → Scribe
Security-first  Atlas → SecurityReviewer → Forge → [QA gates] → Scribe
Research-first  Atlas → FactChecker → Architect → Forge → [QA gates] → Scribe
```

---

## Agents

| Agent | Role | Gate |
|---|---|---|
| **Cortex** | LLM planner — TDD / security / research-first routing | ✅ |
| **Atlas** | Structural memory search | |
| **Architect** | Boundary impact analysis, instincts-aware | |
| **Forge** | Implementation, instincts-aware | |
| **FactChecker** | Grounding gate — parallel QA | ✅ |
| **Reviewer** | Quality gate — parallel QA | ✅ |
| **SecurityReviewer** | OWASP + AgentShield 102-rule scan — parallel QA | ✅ |
| **Probe** | Test coverage gate — parallel QA, TDD-first | ✅ |
| **Scribe** | Docs + changelog | |
| **ReleaseKeeper** | Final release gate | ✅ |
| **Navigator** | Browser automation | |
| **MarketScout** | ECC library → npm / PyPI / GitHub | |
| **Toolsmith** | LLM skill synthesis, instincts-aware | |
| **SandboxQA** | Isolated skill validation, self-corrects 3× | ✅ |

---

## MCP Tools (23)

| Category | Tools |
|---|---|
| Orchestration | `octopus_plan_task` · `octopus_run_task_chain` |
| Memory | `octopus_search_memory` · `octopus_get_decisions` · `octopus_compact_session` |
| Files | `octopus_read_file` · `octopus_write_file` · `octopus_execute_command` |
| Agents | `octopus_create_agent` · `octopus_scan_security` |
| LLM | `octopus_llm_complete` |
| Browser | `octopus_browser_navigate` · `octopus_browser_snapshot` · `octopus_browser_interact` |
| Skills | `octopus_skill_scout` · `octopus_skill_synthesize` · `octopus_skill_validate` · `octopus_skill_deploy` · `octopus_skill_retire` · `octopus_skill_list` |
| Auth | `octopus_login` — interactive OS Vault authorization (3 providers + Vertex/Bedrock guide) |
| Diagnostics | `octopus_vault_check` · `octopus_memory_status` |

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `LLM_PROVIDER` | `anthropic` | `anthropic` · `openai` · `google` · `ollama` |
| `LLM_MODEL` | provider default | Model override — e.g. `gemma4:e2b`, `kimi-k2.6:cloud` |
| `OCTOPUS_CALLER` | — | `claude` · `openai` · `gemini` · `ollama` · `cursor` — activates caller preset |
| `SOVEREIGN_FALLBACK_MODEL` | `gemma4:e2b` | Ollama model used when cloud key is absent |
| `MAX_THINKING_TOKENS` | `Infinity` | Token cap per LLM call — `10000` recommended |
| `COMPACT_THRESHOLD` | `50` | Tool calls before strategic compaction hint |
| `SAFE_MODE` | `true` | `false` to enable mutating tools |
| `AGENTSHIELD_MODE` | `advisory` | `none` · `advisory` · `gate` |
| `ECC_HOOK_PROFILE` | `standard` | `minimal` · `standard` · `strict` |
| `PROJECT_ROOT` | `.` | Repo root for OCTOPUS.md + instinct paths |
| `ECC_RULES_PATH` | `.claude/rules` | Always-loaded ECC guardrail rules |
| `MEMORY_SERVICE_URL` | `http://localhost:5000` | Python memory service |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama server |
| `OCTOPUS_WEBHOOK_URL` | — | Slack / Discord webhook on task completion |

---

## Project Structure

```
Octopus-Agent-System/
├── install.ps1 / install.sh        One-liner installers (Zero-Key, py-aware)
├── start_mcp.ps1 / start_mcp.sh    Self-healing startup + vault pre-flight
├── global-config/
│   ├── universal-mcp.json          Standard MCP manifest for any client
│   └── claude-plugin/plugin.json   Claude Code integration descriptor
├── adapters/
│   ├── openai-functions.json       OpenAI function-calling schema (23 tools)
│   ├── gemini-tools.json           Gemini API tool declarations
│   ├── cursor-mcp.json             Cursor MCP registration block
│   └── ollama-config.json          Ollama model registry (live-detected)
├── OCTOPUS.md                      Developer constitution (injected into agents)
├── DEPLOYMENT.md                   Zero-Key deployment guide
├── CHANGELOG.md
└── node/
    └── src/
        ├── agents/                 14 specialist agents
        ├── skills/agentshield.js   102-rule security scanner
        ├── instincts.js            Continuous Learning v2
        ├── hooks.js                Pre/PostToolUse + ECC_HOOK_PROFILE
        ├── compress.js             Strategic compaction
        ├── permissions.js          Least-privilege memory proxy
        ├── runner.js               Parallel QA stages + instinct extraction
        ├── llm.js                  Multi-provider + caller-aware router + Sovereign Fallback
        ├── mcp.js                  MCP stdio server (23 tools)
        ├── tools.js                Single source of truth for all tool definitions
        ├── cross-link.js           Regenerates all 6 adapter files from tools.js
        ├── vault_set.js            OS Vault writer (keytar + session file fallback)
        ├── vault_login.js          Interactive login menu (enquirer + chalk)
        └── vault_preflight.js      Vault presence check for start scripts
```

---

## Testing

```bash
cd node && npm test
```
```
Test Suites: 6 passed  |  Tests: 72 passed
  agents.test.js              14 core agents
  agents_marketplace.test.js  marketplace agents
  commands.test.js            REST API endpoints
  mcp.test.js                 MCP server — all 23 tools verified
  memory.test.js              5-layer memory bridge
  vault_fallback.test.js      Zero-Key cascade + Gemma 4 Sovereign Fallback
```

---

## Manual Setup

### 1 — Python memory service
```bash
# Windows
py -m pip install -r python/requirements.txt
py python/services/memory_service.py

# Mac/Linux
pip3 install -r python/requirements.txt
python3 python/services/memory_service.py
```

### 2 — Index the repo
```bash
py python/indexer/index_repo.py --root . --db ./data/octopus.db      # Windows
python3 python/indexer/index_repo.py --root . --db ./data/octopus.db # Mac/Linux
```

### 3 — Node
```bash
cd node && npm install
# No .env key editing — use octopus_login in your AI chat
```

### 4 — Authorize (first time)
In your AI chat after connecting:
```
octopus_login
```
Choose Anthropic / OpenAI / Google. A masked prompt captures the key and stores it in the OS Vault.

### 5 — Start
```bash
.\start_mcp.ps1    # Windows — self-healing, vault pre-flight, starts everything
./start_mcp.sh     # Mac/Linux
```

---

## CI / GitHub Actions

| Secret | Required for |
|---|---|
| `ANTHROPIC_API_KEY` | Claude in CI (use `octopus_login` locally) |
| `OPENAI_API_KEY` | GPT-4o in CI |
| `GOOGLE_API_KEY` | Gemini in CI |
| `GITHUB_TOKEN` | Auto-provided — ECC library + MarketScout |

Do **not** add CI secrets to `.env` for local development — use `octopus_login` instead.

---

## License

Apache 2.0 — see [LICENSE](LICENSE).
