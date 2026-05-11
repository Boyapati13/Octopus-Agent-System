# 🐙 Octopus 2.0 — ECC Fusion

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![Tests](https://img.shields.io/badge/tests-72%20passing-brightgreen)](#testing)
[![Agents](https://img.shields.io/badge/agents-14-blue)](#agents)
[![Tools](https://img.shields.io/badge/MCP%20tools-23-purple)](#mcp-tools)
[![AgentShield](https://img.shields.io/badge/AgentShield-102%20rules-red)](#agentshield)
[![ECC Skills](https://img.shields.io/badge/ECC%20Skills-195%2B-orange)](#ecc-fusion)
[![Ollama](https://img.shields.io/badge/Ollama-Gemma%204%20ready-blue)](#ollama--gemma-4)
[![Zero-Key](https://img.shields.io/badge/Auth-Zero--Key%20Vault-success)](#zero-key-authentication)

A **self-evolving**, **continuously-learning** multi-agent AI system. Octopus 2.0 fuses the complete [Everything Claude Code (ECC)](https://github.com/affaan-m/everything-claude-code) ecosystem into its core — 195+ pre-vetted skills, 102 AgentShield security rules, Continuous Learning v2 (Instincts), and parallel QA execution.

Works with **Claude · GPT-4o · Gemini · Ollama/Gemma 4** (local, no API key). Installs into Claude Desktop, Claude Code, Cursor, Windsurf, and Continue.dev automatically.

**Zero-Key architecture:** API keys never touch `.env`. Run `octopus_login` in your AI chat — the browser opens the provider dashboard, you paste the key once, and it's stored in the OS Vault (Windows Credential Manager / macOS Keychain / Linux Secret Service). No file editing, no credential leaks.

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
- Installs all Node + Python dependencies (including `keytar` for OS Vault access)
- Auto-detects Ollama/Gemma 4 and pre-configures the LLM provider
- Writes `node/.env` with ECC 2.0 defaults — **no API keys in the file**
- Guards `node/.env` in `.gitignore`
- Registers the MCP server with every detected client (Claude Desktop, Claude Code, Cursor, Windsurf, Continue.dev)
- Bootstraps `.claude/rules/` ECC guardrail files

Restart your LLM client after running — all 23 Octopus tools appear automatically.

**Zero-Key first run:** after starting the MCP server, type `octopus_login` in your AI chat to link your first provider.

---

## Start the Stack

After installing, two scripts launch the full system:

**Windows**
```powershell
.\start_mcp.ps1
```

**Mac / Linux**
```bash
./start_mcp.sh
```

Both scripts start the Python memory service (port 5000) and the Node MCP server together, and clean up the background process on exit. Or start them individually:

```bash
# Terminal 1 — Python memory service
python python/services/memory_service.py

# Terminal 2 — MCP server (Claude Desktop / Cursor / Windsurf)
cd node && npm run mcp

# Terminal 3 — REST API (optional dashboard / direct API access)
cd node && npm run serve
```

---

## What's New in 2.0 — ECC Fusion

| Feature | What was added |
|---|---|
| **195+ ECC Skills** | MarketScout checks the ECC library first before npm/PyPI/GitHub |
| **102 AgentShield rules** | 5-category security scanner wired into SecurityReviewer |
| **Continuous Learning v2** | Instincts extracted from sessions, stored in SQLite, graduated to skills |
| **Strategic Compaction** | Milestone-aware context reduction — hint fires at 50 tool calls |
| **MAX_THINKING_TOKENS** | Token budget cap applied across all 4 LLM providers |
| **ECC Constitution layer** | `.claude/rules/*.md` injected first into every agent's context |
| **Parallel QA execution** | Reviewer ‖ SecurityReviewer ‖ Probe ‖ FactChecker run simultaneously |
| **TDD-first routing** | Cortex sends Probe before Forge for test-driven tasks |
| **Ollama / Gemma 4** | Full local inference — no API key, no cloud cost |
| **Zero-Key Authentication** | `octopus_login` stores keys in OS Vault — no `.env` editing ever |
| **Cross-platform Vault** | Windows Credential Manager · macOS Keychain · Linux Secret Service |
| **Windows-native** | Installer auto-escapes paths, detects `py` launcher, configures all clients |

---

## ⚡ Performance

### ~75% QA Speedup — Parallel Gate Execution

```
Before  Atlas → Forge → Reviewer → SecurityReviewer → Probe → FactChecker → Scribe
                         ↑  sequential — each waits for the previous (~4s)

After   Atlas → Forge → [Reviewer ‖ SecurityReviewer ‖ Probe ‖ FactChecker] → Scribe
                         ↑  one Promise.allSettled stage (~1s)  75% faster
```

All gate failures collected together — no partial reporting on first fail.

### ~60% Token Cost Reduction

```env
MAX_THINKING_TOKENS=10000    # ECC default — caps every LLM call
COMPACT_THRESHOLD=50         # Suggest compaction after 50 tool calls
```

`strategicCompact()` strips resolved context at milestone boundaries. The runner emits a compaction hint between stages, never mid-stage. Works across all providers.

---

## 🧠 Continuous Learning v2 — Instincts

At the end of every task chain, `processSession()` extracts patterns automatically:

```
Agent notes + findings
      ↓  extractCandidates()  — confidence-weighted scoring
      ↓  cluster()            — word-overlap similarity grouping
      ↓  persistInstinct()    — SQLite instincts table  →  GET /instincts
      ↓  elevateToSkills()    — confidence ≥ 0.8 → MarketScout proposal → active skill
```

**Lifecycle:**
```
Session 1  "Always use Promise.all for parallel calls"  confidence 0.55  occurrences 1
Session 3  Same pattern seen again                       confidence 0.70  occurrences 3
Session 6  Pattern confirmed                             confidence 0.83  occurrences 6
           → elevated to skill candidate → /evolve → active skill
```

Injected into L5 context for: Cortex, Forge, Architect, SecurityReviewer, MarketScout, Toolsmith.

---

## 🛡️ AgentShield — 3-Layer Security

```
Layer 1  PreToolUse hook       0 tokens, synchronous   Blocks rm -rf /, fork bombs, DROP DATABASE
Layer 2  SecurityReviewer      OWASP Top 10            Quick patterns + AgentShield 5-category scan
Layer 3  AgentShield gate      102 static rules        AGENTSHIELD_MODE=gate blocks on critical findings
```

| Category | Rules | Catches |
|---|---|---|
| AS-S Secrets | 14 | API keys, private keys, connection strings |
| AS-P Permissions | 20 | `SAFE_MODE=false`, `new Function()`, `__proto__`, `chmod 777` |
| AS-H Hook injection | 15 | `$()` in hooks, unescaped `execSync`, `eval` in PreToolUse |
| AS-M MCP risk | 15 | `autoApprove:true`, raw shell transport, system root paths |
| AS-A Agent config | 15 | Path traversal in agentName, unconditional `approved:true` |
| AS-Q Code quality | 23 | `console.log`, `var`, `any`, empty catch, `innerHTML=` |

```env
AGENTSHIELD_MODE=none      # disabled
AGENTSHIELD_MODE=advisory  # log only (default)
AGENTSHIELD_MODE=gate      # block pipeline on critical findings
```

---

## Architecture

### 5-Layer Memory + Instincts

```
L5  Task Context Profile  ephemeral · built per agent per call
                          Injection order (highest weight first):
                          1. OCTOPUS.md constitution
                          2. ECC rules (.claude/rules/*.md)
                          3. Instincts (confidence ≥ 0.7, top 10)
                          4. L1 structural / L2 decisions / L3 run state
L4  Prompt Cache          Redis optional · MD5-keyed (auto-invalidates on rule change)
L3  Run State             SQLite session + compaction
L2  Decision Memory       SQLite ADRs + instincts table
L1  Structural Memory     SQLite graph + NetworkX runtime reasoning
```

### Self-Evolving Skill Marketplace

```
ECC library (primary) → npm / PyPI / GitHub → Toolsmith → SandboxQA → Cortex → Active Registry
  195+ vetted skills      fallback search       LLM synth   validate    approve    MCP + REST
```

### Cortex Planning Patterns

```
Default        Atlas → Architect → Forge → [QA gates] → Scribe → ReleaseKeeper
TDD-first      Atlas → Probe (write tests) → Forge → [QA gates] → Scribe
Security-first Atlas → SecurityReviewer → Forge → [QA gates] → Scribe
Research-first Atlas → FactChecker → Architect → Forge → [QA gates] → Scribe
```

---

## Zero-Key Authentication

API keys are **never stored in `.env`**. The `getSecureKey` cascade resolver retrieves them at runtime through four tiers:

```
1. OS Vault       keytar → Windows Credential Manager / macOS Keychain / Linux Secret Service
2. CLI Session    ~/.octopus/sessions.json  (written by octopus_login; cross-platform fallback)
3. Process Env    set externally or sourced by the parent shell before start
4. .env fallback  node/.env plain-text (last resort, not recommended)
```

### Authorizing a provider

In any AI chat with Octopus connected:
```
octopus_login   (then choose: anthropic | openai | google)
```

What happens:
1. The agent-browser opens the provider's API key dashboard
2. A masked prompt appears (or clear Authorize instructions on Linux)
3. You paste your key — it's stored in the OS Vault immediately
4. The `.env` file is never touched

To migrate existing keys from `.env` to the Vault, run `.\start_mcp.ps1` (Windows) or `./start_mcp.sh` (Mac/Linux) — the pre-flight check offers to migrate automatically.

---

## Manual Setup

### 1 — Python memory service
```bash
cd python
pip install -r requirements.txt
python services/memory_service.py    # port 5000
```

### 2 — Index the repo (creates octopus.db + instincts table)
```bash
python python/indexer/index_repo.py --root . --db ./data/octopus.db
```

### 3 — Node
```bash
cd node
npm install
# No .env key editing needed — use octopus_login (see above)
```

### 4 — LLM provider

**Local — Gemma 4 (recommended, no API key)**
```bash
ollama pull gemma4:e2b    # default — efficient, works for most tasks
ollama pull gemma4:9b     # recommended for complex Cortex planning (~8 GB VRAM)
```
```env
LLM_PROVIDER=ollama
LLM_MODEL=gemma4:e2b
OLLAMA_BASE_URL=http://localhost:11434
```

**Cloud providers — link via OS Vault (no .env required)**
```
octopus_login   # then choose: anthropic / openai / google
```
Or set environment variables as a fallback:
```env
LLM_PROVIDER=anthropic   ANTHROPIC_API_KEY=sk-ant-...
LLM_PROVIDER=openai      OPENAI_API_KEY=sk-...
LLM_PROVIDER=google      GOOGLE_API_KEY=AIza...
```

### 5 — Start
```bash
./start_mcp.sh        # starts memory service + MCP server together (with vault pre-flight)
# or individually:
npm run mcp           # MCP stdio server
npm run serve         # REST API (port 3001)
npm test              # 72 tests
```

---

## Ollama / Gemma 4

Octopus 2.0 is built for local inference. The installer auto-detects Ollama and pre-configures the `.env`.

| Model | VRAM | Best for |
|---|---|---|
| `gemma4:e2b` | ~3 GB | Day-to-day tasks, Forge, Scribe, fast iteration (default) |
| `gemma4:9b` | ~8 GB | **Complex Cortex planning**, SecurityReviewer deep analysis |
| `llama3.2` | ~2 GB | Minimal footprint, simple task chains |
| `qwen2.5-coder:7b` | ~5 GB | Code-heavy tasks, Forge + Reviewer |

Switch model at any time by updating `LLM_MODEL` in `node/.env` — no restart of other services needed.

`MAX_THINKING_TOKENS=10000` caps `num_predict` per call across all Ollama models.

---

## Agents

| Agent | Role | Gate | 2.0 Addition |
|---|---|---|---|
| **Cortex** | LLM planner — TDD/security/research-first | ✅ | Team pattern routing |
| **Atlas** | Structural memory search | | |
| **Architect** | Boundary impact analysis | | Instincts-aware |
| **Forge** | Implementation | | Instincts-aware |
| **FactChecker** | Grounding gate | ✅ | Parallel QA stage |
| **Reviewer** | Quality gate | ✅ | Parallel QA stage |
| **SecurityReviewer** | OWASP + AgentShield 102-rule scan | ✅ | 3-layer pipeline |
| **Probe** | Test coverage gate | ✅ | Parallel QA; TDD-first |
| **Scribe** | Docs + changelog | | |
| **ReleaseKeeper** | Final release gate | ✅ | |
| **Navigator** | Browser automation | | |
| **MarketScout** | ECC library → npm/PyPI/GitHub | | ECC primary source |
| **Toolsmith** | LLM skill synthesis | | Instincts-aware |
| **SandboxQA** | Isolated skill validation, self-corrects 3× | ✅ | |

---

## MCP Tools

| Category | Tools |
|---|---|
| Orchestration | `octopus_plan_task`, `octopus_run_task_chain` |
| Memory | `octopus_search_memory`, `octopus_get_decisions`, `octopus_compact_session` |
| Files | `octopus_read_file`, `octopus_write_file` (auto-formats JS/TS), `octopus_execute_command` |
| Agents | `octopus_create_agent` (path-validated), `octopus_scan_security` |
| LLM | `octopus_llm_complete` (MAX_THINKING_TOKENS capped) |
| Browser | `octopus_browser_navigate`, `octopus_browser_snapshot`, `octopus_browser_interact` |
| Skills | `octopus_skill_scout`, `octopus_skill_synthesize`, `octopus_skill_validate`, `octopus_skill_deploy`, `octopus_skill_retire`, `octopus_skill_list` |
| **Auth** | **`octopus_login`** — Zero-Key OS Vault authentication (Windows · macOS · Linux) |

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `LLM_PROVIDER` | `anthropic` | `anthropic` · `openai` · `google` · `ollama` |
| `LLM_MODEL` | provider default | Model override (e.g. `gemma4:9b`) |
| `MAX_THINKING_TOKENS` | `Infinity` | Token cap per call — set `10000` for ECC optimisation |
| `COMPACT_THRESHOLD` | `50` | Tool calls before strategic compaction hint |
| `SAFE_MODE` | `true` | `false` to enable mutating tools |
| `AGENTSHIELD_MODE` | `advisory` | `none` · `advisory` · `gate` |
| `ECC_HOOK_PROFILE` | `standard` | `minimal` · `standard` · `strict` |
| `PROJECT_ROOT` | `.` | Repo root — for OCTOPUS.md + instinct paths |
| `ECC_RULES_PATH` | `.claude/rules` | Always-loaded ECC guardrail rules |
| `MEMORY_SERVICE_URL` | `http://localhost:5000` | Python memory service |
| `OCTOPUS_WEBHOOK_URL` | — | Slack/Discord webhook on task completion |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama server URL |

---

## SAFE_MODE

Mutating tools disabled by default. Always-on read-only tools:
`octopus_search_memory`, `octopus_scan_security`, `octopus_read_file`,
`octopus_plan_task`, `octopus_skill_list`, `octopus_llm_complete`, `octopus_browser_snapshot`

Set `SAFE_MODE=false` to enable the full pipeline. PreToolUse fatal-command blocks apply regardless of SAFE_MODE.

---

## Testing

```bash
cd node && npm test
```
```
Test Suites: 6 passed  |  Tests: 72 passed
  agents.test.js              10 core agents
  agents_marketplace.test.js  4 marketplace agents
  commands.test.js            REST API endpoints
  mcp.test.js                 MCP server + all 23 tools
  memory.test.js              5-layer memory bridge
  vault_fallback.test.js      Zero-Key: getSecureKey cascade + Gemma 4 fallback
```

---

## Project Structure

```
Octopus-Agent-System/
├── install.ps1 / install.sh     Universal one-liner installers (Zero-Key aware)
├── start_mcp.ps1 / start_mcp.sh Full-stack startup + vault pre-flight check
├── OCTOPUS.md                   Developer constitution (injected into all agents)
├── DEPLOYMENT.md                Step-by-step guide + Zero-Key setup
├── CHANGELOG.md
├── node/
│   └── src/
│       ├── agents/              14 agents
│       ├── skills/agentshield.js  102-rule 5-category scanner
│       ├── instincts.js         Continuous Learning v2
│       ├── hooks.js             Pre/PostToolUse + ECC_HOOK_PROFILE
│       ├── compress.js          Strategic compaction
│       ├── permissions.js       Least-privilege memory proxy
│       ├── runner.js            Parallel stages + instinct extraction
│       ├── llm.js               Multi-provider + 4-tier getSecureKey cascade
│       ├── mcp.js               MCP stdio server (23 tools)
│       ├── vault_set.js         OS Vault writer (keytar + session file fallback)
│       └── vault_preflight.js   Vault presence check (used by start scripts)
├── python/
│   ├── memory/context_builder.py  L5 — constitution → ECC rules → instincts → L1-L3
│   ├── memory/schema.py           SQLite + instincts table
│   └── services/memory_service.py Flask + /instincts endpoints
└── .claude/rules/               ECC guardrails (always-loaded into every agent)
```

---

## CI / GitHub Actions

| Secret | Required for |
|---|---|
| `ANTHROPIC_API_KEY` | Claude (CI only — use `octopus_login` locally) |
| `OPENAI_API_KEY` | GPT-4o (CI only) |
| `GOOGLE_API_KEY` | Gemini (CI only) |
| `GITHUB_TOKEN` | Auto-provided — ECC skill library + MarketScout |

For local development, **do not add CI secrets to `.env`** — use `octopus_login` instead.

---

## License

Apache 2.0 — see [LICENSE](LICENSE).
