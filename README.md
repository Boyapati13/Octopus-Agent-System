# 🐙 Octopus 2.0 — ECC Fusion

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![Tests](https://img.shields.io/badge/tests-63%20passing-brightgreen)](#testing)
[![Agents](https://img.shields.io/badge/agents-14-blue)](#agents)
[![Tools](https://img.shields.io/badge/MCP%20tools-20-purple)](#mcp-tools)
[![AgentShield](https://img.shields.io/badge/AgentShield-102%20rules-red)](#agentshield)
[![ECC Skills](https://img.shields.io/badge/ECC%20Skills-195%2B-orange)](#ecc-fusion)
[![Ollama](https://img.shields.io/badge/Ollama-Gemma%204%20ready-blue)](#ollama--gemma-4)

A **self-evolving**, **continuously-learning** multi-agent AI system. Octopus 2.0 fuses the complete [Everything Claude Code (ECC)](https://github.com/affaan-m/everything-claude-code) ecosystem into its core — 195+ pre-vetted skills, 102 AgentShield security rules, Continuous Learning v2 (Instincts), and parallel QA execution.

Works with **Claude · GPT-4o · Gemini · Ollama/Gemma 4** (local, no API key). Installs into Claude Desktop, Cursor, and Windsurf automatically.

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
- Installs all Node + Python dependencies
- Auto-detects Ollama/Gemma 4 and pre-configures the LLM provider
- Writes `node/.env` with all ECC 2.0 defaults (`MAX_THINKING_TOKENS`, `AGENTSHIELD_MODE`, `PROJECT_ROOT`, etc.)
- Injects the MCP server config into every detected client (Claude Desktop, Cursor, Windsurf)
- Bootstraps `.claude/rules/` ECC guardrail files

Restart your LLM client after running — all 20 Octopus tools appear automatically.

---

## 🚀 What's New in 2.0 — ECC Fusion

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
| **Windows-native** | Installer auto-escapes paths, detects `py` launcher, configures registry |

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
Layer 3  AgentShield gate      102 static rules        AGENTSHIELD_MODE=gate blocks on critical AS findings
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
Default       Atlas → Architect → Forge → [QA gates] → Scribe → ReleaseKeeper
TDD-first     Atlas → Probe (write tests) → Forge → [QA gates] → Scribe
Security-first Atlas → SecurityReviewer → Forge → [QA gates] → Scribe
Research-first Atlas → FactChecker → Architect → Forge → [QA gates] → Scribe
```

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
cp .env.example .env   # then fill in keys
npm install
```

### 4 — LLM provider

**Local — Gemma 4 (recommended, no API key)**
```bash
ollama pull gemma4:e2b
```
```env
LLM_PROVIDER=ollama
LLM_MODEL=gemma4:e2b
OLLAMA_BASE_URL=http://localhost:11434
```

**Cloud providers**
```env
# Claude
LLM_PROVIDER=anthropic   ANTHROPIC_API_KEY=sk-ant-...

# GPT-4o
LLM_PROVIDER=openai      OPENAI_API_KEY=sk-...

# Gemini
LLM_PROVIDER=google      GOOGLE_API_KEY=AIza...
```

### 5 — Start
```bash
npm run mcp     # MCP stdio server (Claude Desktop / Cursor / Windsurf)
npm run serve   # REST API         (port 3001)
npm test        # 63 tests
```

---

## Ollama / Gemma 4

Octopus 2.0 is designed for local inference. Gemma 4 (`gemma4:e2b`) detected and pre-configured on verified test machines.

```bash
# Install Ollama
# macOS/Linux: https://ollama.com
# Windows:     https://ollama.com/download/windows
```

**Model selection guide:**

| Model | VRAM | Best for |
|---|---|---|
| `gemma4:e2b` | ~3 GB | Day-to-day tasks, Forge, Scribe, fast iteration |
| `gemma4:9b` | ~8 GB | Complex Cortex planning, SecurityReviewer deep analysis |
| `llama3.2` | ~2 GB | Minimal footprint, simple task chains |
| `qwen2.5-coder:7b` | ~5 GB | Code-heavy tasks, Forge + Reviewer |

The installer auto-selects `gemma4:e2b`. For complex multi-agent planning tasks, upgrade to the 9B:

```bash
ollama pull gemma4:e2b    # default — efficient, works for most tasks
ollama pull gemma4:9b     # recommended for complex Cortex planning (needs ~8 GB VRAM)
```

Then set in `node/.env`:
```env
LLM_MODEL=gemma4:9b   # upgrade Cortex planning quality
```

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
| Agents | `octopus_create_agent` (AS-A04 path validation), `octopus_scan_security` |
| LLM | `octopus_llm_complete` (MAX_THINKING_TOKENS capped) |
| Browser | `octopus_browser_navigate`, `octopus_browser_snapshot`, `octopus_browser_interact` |
| Skills | `octopus_skill_scout`, `octopus_skill_synthesize`, `octopus_skill_validate`, `octopus_skill_deploy`, `octopus_skill_retire`, `octopus_skill_list` |

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `LLM_PROVIDER` | `anthropic` | `anthropic` · `openai` · `google` · `ollama` |
| `LLM_MODEL` | provider default | Model override (e.g. `gemma4:e2b`) |
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
Test Suites: 5 passed  |  Tests: 63 passed
  agents.test.js              10 core agents
  agents_marketplace.test.js  4 marketplace agents
  commands.test.js            REST API endpoints
  mcp.test.js                 MCP server + all 20 tools
  memory.test.js              5-layer memory bridge
```

---

## Project Structure

```
Octopus-Agent-System/
├── install.ps1                  Universal Windows installer (one-liner)
├── install.sh                   Universal Mac/Linux installer (one-liner)
├── start_mcp.ps1 / start_mcp.sh Service launchers
├── OCTOPUS.md                   Developer constitution (injected into all agents)
├── DEPLOYMENT.md                Windows step-by-step guide + MCP config snippets
├── CHANGELOG.md                 Full version history
├── node/
│   └── src/
│       ├── agents/              14 agents (Cortex team-patterns, SecurityReviewer 3-layer)
│       ├── skills/
│       │   ├── agentshield.js   102-rule 5-category scanner
│       │   └── security.js      OWASP Top 10 base scanner
│       ├── instincts.js         Continuous Learning v2
│       ├── hooks.js             Pre/PostToolUse + ECC_HOOK_PROFILE + registerHookGuard
│       ├── compress.js          Strategic compaction + caveman compression
│       ├── permissions.js       Least-privilege memory proxy
│       ├── runner.js            Parallel stages + instinct extraction
│       ├── llm.js               Multi-provider + MAX_THINKING_TOKENS cap
│       └── mcp.js               MCP stdio server (AS-A04 validated)
├── python/
│   ├── memory/
│   │   ├── context_builder.py   L5 — constitution → ECC rules → instincts → L1-L3
│   │   └── schema.py            L2+L3 SQLite + instincts table
│   └── services/memory_service.py  Flask + /instincts endpoints
└── .claude/rules/               ECC guardrails (node.md, security.md)
```

---

## CI / GitHub Actions

| Secret | Required for |
|---|---|
| `ANTHROPIC_API_KEY` | Claude (default) |
| `OPENAI_API_KEY` | GPT-4o |
| `GOOGLE_API_KEY` | Gemini |
| `GITHUB_TOKEN` | Auto-provided — ECC skill library + MarketScout rate limits |

---

## License

Apache 2.0 — see [LICENSE](LICENSE).
