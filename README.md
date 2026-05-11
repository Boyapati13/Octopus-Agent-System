# 🐙 Octopus 2.0 — ECC Fusion

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![Tests](https://img.shields.io/badge/tests-63%20passing-brightgreen)](#testing)
[![Agents](https://img.shields.io/badge/agents-14-blue)](#14-agents)
[![Tools](https://img.shields.io/badge/MCP%20tools-20-purple)](#20-mcp-tools)
[![AgentShield](https://img.shields.io/badge/AgentShield-102%20rules-red)](#agentshield-security)
[![ECC Skills](https://img.shields.io/badge/ECC%20Skills-195%2B-orange)](#ecc-fusion)

A **self-evolving**, **continuously-learning** multi-agent AI system. Octopus 2.0 fuses the complete [Everything Claude Code (ECC)](https://github.com/affaan-m/everything-claude-code) ecosystem into its core — adding 195+ pre-vetted skills, 102 security rules, continuous instinct learning, and parallel QA execution.

Works with **Claude · GPT-4o · Gemini · Ollama** (local). Installs into Claude Desktop / Cursor / Windsurf in one command.

---

## 🚀 Octopus 2.0 — ECC Fusion

Octopus 2.0 absorbs the best of ECC's architecture directly into the agent runtime:

| Feature | What was added | Source |
|---|---|---|
| **195+ Skills** | MarketScout checks the ECC skill library first before npm/PyPI/GitHub | ECC `.agents/skills/` |
| **102 Security Rules** | AgentShield scanner across 5 categories wired into SecurityReviewer | ECC AgentShield |
| **Continuous Learning v2** | Instincts extracted from session notes, stored in L2, graduated to skills | ECC Homunculus |
| **Strategic Compaction** | Milestone-aware context reduction at COMPACT_THRESHOLD (default 50 calls) | ECC strategic-compact |
| **MAX_THINKING_TOKENS** | Token budget cap on every LLM call — set `MAX_THINKING_TOKENS=10000` | ECC token optimization |
| **ECC Constitution** | `.claude/rules/*.md` injected into every agent's L5 context | ECC guardrails |
| **ECC_HOOK_PROFILE** | `minimal|standard|strict` hook strictness levels | ECC hook system |
| **TDD-first routing** | Cortex sends Probe before Forge for test-driven tasks | ECC tdd-workflow |
| **Verification loop** | Full quality gate keyword route: all 4 review agents + release gate | ECC verification-loop |

---

## ⚡ Performance Metrics

### ~75% QA Phase Speedup — Parallel Gate Execution

The runner groups consecutive review agents into a single `Promise.allSettled` stage. On the default 9-agent chain:

```
Before (sequential):
  Atlas → Forge → Reviewer(1s) → SecurityReviewer(1s) → Probe(1s) → FactChecker(1s) → Scribe
  Total QA wall time: ~4 seconds

After (parallel):
  Atlas → Forge → [Reviewer ‖ SecurityReviewer ‖ Probe ‖ FactChecker](1s) → Scribe
  Total QA wall time: ~1 second  (75% reduction)
```

All gate failures in a parallel stage are collected and reported together — no partial information on first-fail.

### ~60% Token Cost Reduction — Strategic Compaction + MAX_THINKING_TOKENS

```env
MAX_THINKING_TOKENS=10000           # Cap per-call token budget (ECC default)
CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=50  # Compact at 50% context, not 95%
COMPACT_THRESHOLD=50                # Suggest compaction after 50 tool calls
```

- `MAX_THINKING_TOKENS` caps every LLM completion call across all 4 providers
- `strategicCompact()` strips resolved context at milestone boundaries (after research phases, completed milestones, debugging sessions)
- Runner emits a compaction hint between stages when threshold is reached — never mid-stage

---

## 🧠 Continuous Learning v2 — Instincts

At the end of every task chain, `processSession()` fires automatically:

```
Agent run notes + findings
        ↓
  extractCandidates()    — score signal-bearing notes (security, performance, convention patterns)
        ↓
     cluster()           — group similar patterns by word-overlap similarity
        ↓
  persistInstinct()      — save to SQLite instincts table via POST /instincts
        ↓
elevateToSkillProposals()— instincts at confidence ≥ 0.8 become MarketScout skill candidates
```

**Where instincts live:**
- Stored in `python/memory/schema.py` → `instincts` table (confidence, occurrences, category, sources)
- Exposed at `GET /instincts`, `POST /instincts`, `PATCH /instincts/:id/evolve`
- Injected into L5 context for agents that have `instincts` in their profile (cortex, forge, architect, security-reviewer, marketscout, toolsmith)
- Revisiting the same pattern in a future session increments `occurrences` and boosts `confidence`

**The lifecycle:**
```
Session 1: Promise.all pattern noted       → confidence: 0.55, occurrences: 1
Session 2: Same pattern observed again     → confidence: 0.65, occurrences: 2
Session 5: Pattern confirmed multiple times → confidence: 0.82, occurrences: 5
                                             → elevated to MarketScout skill proposal
                                             → /evolve graduates it to active skill
```

---

## 🛡️ AgentShield Security — 3-Layer Pipeline

```
Layer 1  PreToolUse hook     Synchronous, 0 tokens    Fatal OS commands blocked (rm -rf /, fork bombs, DROP DATABASE)
Layer 2  SecurityReviewer    LLM + patterns            OWASP Top 10 + AgentShield 5-category scan
Layer 3  AgentShield gate    Static analysis           102 rules — secrets, permissions, hook injection, MCP risk, agent config
```

### AgentShield Rule Categories

| Category | Rules | Examples |
|---|---|---|
| **AS-S** Secrets | 14 | OpenAI/Anthropic/GitHub/AWS keys, private key material, Stripe live keys |
| **AS-P** Permissions | 20 | `SAFE_MODE=false`, `new Function()`, `__proto__`, prototype pollution, `chmod 777` |
| **AS-H** Hook injection | 15 | `$()` in hooks, template literals in `execSync`, `eval` in PreToolUse |
| **AS-M** MCP risk | 15 | `autoApprove:true`, raw shell transport, filesystem root at `/etc`, no timeout |
| **AS-A** Agent config | 15 | Path traversal in agentName (AS-A04 fixed), unconditional `approved:true` |
| **AS-Q** Code quality | 23 | `console.log`, `var`, TypeScript `any`, empty catch, `innerHTML=`, weak hashing |

**`AGENTSHIELD_MODE` env var:**
```
none     → disabled (use when speed > security depth)
advisory → findings logged, chain not blocked (default)
gate     → critical AgentShield findings block the pipeline (strictest)
```

**Conflict prevention:** `registerHookGuard('agentshield:securityreviewer:scan')` is a session-scoped deduplication lock — if SecurityReviewer runs twice, the second call skips the AgentShield scan. Octopus PreToolUse (OS-level) and AgentShield (source-level) operate on different layers and never overlap.

---

## Architecture

### 5-Layer Memory + Instincts

```
L5  Task Context Profile    ephemeral, per-agent — injected order:
                              1. OCTOPUS.md constitution
                              2. ECC guardrails (.claude/rules/*.md)
                              3. Instincts (confidence ≥ 0.7)
                              4. Structural / decisions / run state
L4  Prompt Cache            Redis/Valkey optional, MD5-keyed (auto-invalidates on constitution change)
L3  Run State               SQLite session + compaction
L2  Decision Memory         SQLite ADRs + instincts table
L1  Structural Memory       SQLite graph facts + NetworkX runtime reasoning
```

### Self-Evolving Skill Marketplace (ECC-enhanced)

```
ECC Library (primary) → npm/PyPI/GitHub → Toolsmith → SandboxQA → Cortex CEO → Active Registry
  195+ vetted skills     fallback          synthesise    validate      approve       MCP + REST
```

### LLM-Backed Planning — ECC Team Patterns

Cortex now recognises three named execution patterns:

```
TDD-first:      Atlas → Probe (write tests) → Forge → [Reviewer‖SecurityReviewer‖Probe] → Scribe
Security-first: Atlas → SecurityReviewer → Forge → [Reviewer‖SecurityReviewer‖Probe] → Scribe
Research-first: Atlas → FactChecker → Architect → Forge → [review gates] → Scribe
Default:        Atlas → Architect → Forge → [Reviewer‖SecurityReviewer‖Probe‖FactChecker] → Scribe
```

---

## Quick Install

```bash
# Mac / Linux
./install.sh

# Windows
.\install.ps1
```

Restart your LLM client — all 20 Octopus tools appear automatically.

---

## Setup

### 1 — Python memory service
```bash
cd python
pip install -r requirements.txt
python services/memory_service.py    # port 5000
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

### 4 — Choose your LLM + set ECC parameters

```env
# LLM provider
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...

# ECC token optimization (~60% cost reduction)
MAX_THINKING_TOKENS=10000
COMPACT_THRESHOLD=50
COMPACT_REMINDER_INTERVAL=25

# AgentShield depth
AGENTSHIELD_MODE=advisory   # none | advisory | gate

# Hook strictness (ECC-compatible)
ECC_HOOK_PROFILE=standard   # minimal | standard | strict

# OCTOPUS.md constitution + ECC rules
PROJECT_ROOT=/path/to/your/repo
ECC_RULES_PATH=/path/to/your/repo/.claude/rules

# Webhook on task completion
OCTOPUS_WEBHOOK_URL=https://hooks.slack.com/services/...
```

**Other providers:**
```env
LLM_PROVIDER=openai    OPENAI_API_KEY=sk-...
LLM_PROVIDER=google    GOOGLE_API_KEY=AIza...
LLM_PROVIDER=ollama    OLLAMA_BASE_URL=http://localhost:11434   LLM_MODEL=llama3.2
```

### 5 — Start
```bash
npm run mcp      # MCP server  (Claude Desktop / Cursor / Windsurf)
npm run serve    # REST API    (port 3001)
npm test         # 63 tests
```

### 6 — OCTOPUS.md constitution (optional but recommended)

```bash
cat > OCTOPUS.md << 'EOF'
# Project Constitution
- Never use Moment.js — use date-fns
- All database queries through the repository layer — no raw SQL in controllers
- API responses: { ok, data, error } envelope format
- No console.log in production — use console.error for diagnostics
EOF
export PROJECT_ROOT=$(pwd)
```

---

## 14 Agents

| Agent | Role | Gate | ECC Enhancement |
|---|---|---|---|
| **Cortex** | LLM planner — TDD/security/research-first patterns | ✅ | Team pattern routing |
| **Atlas** | Structural memory search — queries L1 before opening files | | |
| **Architect** | Boundary impact — assesses what a change touches | | Instincts-aware |
| **Forge** | Implementation — scopes and drafts code edits | | Instincts-aware |
| **FactChecker** | Grounding gate — verifies claims against indexed memory | ✅ | Parallel QA stage |
| **Reviewer** | Quality gate | ✅ | Parallel QA stage |
| **SecurityReviewer** | OWASP Top 10 + AgentShield 102-rule scan | ✅ | 3-layer security pipeline |
| **Probe** | Test coverage gate | ✅ | Parallel QA stage; TDD-first routing |
| **Scribe** | Docs and changelog writer | | |
| **ReleaseKeeper** | Final release gate — all approvals required | ✅ | |
| **Navigator** | Browser — navigate, snapshot, click, fill | | |
| **MarketScout** | ECC library → npm/PyPI/GitHub skill scouting | | ECC primary source |
| **Toolsmith** | Synthesises MCP skills from documentation via LLM | | Instincts-aware |
| **SandboxQA** | Validates skills in isolated Worker threads, self-corrects 3× | ✅ | |

---

## 20 MCP Tools

### Task Orchestration
| Tool | Description |
|---|---|
| `octopus_plan_task` | Ask Cortex to plan a task (TDD/security/research-first aware) |
| `octopus_run_task_chain` | Run the full parallel pipeline end-to-end |

### Memory + Instincts
| Tool | Description |
|---|---|
| `octopus_search_memory` | Query L1 structural graph |
| `octopus_get_decisions` | Retrieve ADRs from L2 |
| `octopus_compact_session` | Strategic compaction — compress session into long-term memory |

### File & Execution
| Tool | Description |
|---|---|
| `octopus_read_file` | Read a workspace file |
| `octopus_write_file` | Write (auto-formats JS/TS via PostToolUse; ECC quality warnings) |
| `octopus_execute_command` | Shell (PreToolUse blocks fatal patterns synchronously) |

### Agents & Security
| Tool | Description |
|---|---|
| `octopus_create_agent` | Synthesise and hot-reload a new agent (agentName validated AS-A04) |
| `octopus_scan_security` | OWASP Top 10 + AgentShield 5-category static scan |

### LLM
| Tool | Description |
|---|---|
| `octopus_llm_complete` | Prompt the active provider — MAX_THINKING_TOKENS capped |

### Browser
| Tool | Description |
|---|---|
| `octopus_browser_navigate` | Navigate to URL |
| `octopus_browser_snapshot` | Capture accessibility tree |
| `octopus_browser_interact` | Click / fill / eval |

### Skill Marketplace
| Tool | Description |
|---|---|
| `octopus_skill_scout` | Scan ECC library + npm/PyPI/GitHub |
| `octopus_skill_synthesize` | Read docs + synthesise MCP skill |
| `octopus_skill_validate` | SandboxQA with self-correction |
| `octopus_skill_deploy` | Deploy QA-passed skill |
| `octopus_skill_retire` | Retire deprecated skill |
| `octopus_skill_list` | List all skills with status |

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `LLM_PROVIDER` | `anthropic` | `anthropic` · `openai` · `google` · `ollama` |
| `LLM_MODEL` | provider default | Model override |
| `MAX_THINKING_TOKENS` | `Infinity` | Token budget cap per LLM call (ECC: `10000`) |
| `COMPACT_THRESHOLD` | `50` | Tool calls before strategic compaction hint |
| `COMPACT_REMINDER_INTERVAL` | `25` | Re-reminder interval after threshold |
| `SAFE_MODE` | `true` | `false` to enable mutating tools |
| `AGENTSHIELD_MODE` | `advisory` | `none` · `advisory` · `gate` |
| `ECC_HOOK_PROFILE` | `standard` | `minimal` · `standard` · `strict` |
| `PROJECT_ROOT` | `.` | Repo root — used for OCTOPUS.md + instinct extraction |
| `ECC_RULES_PATH` | `.claude/rules` | ECC guardrail rules directory |
| `MEMORY_SERVICE_URL` | `http://localhost:5000` | Python memory service |
| `OCTOPUS_WEBHOOK_URL` | — | Slack/Discord webhook for task completion |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama server |

---

## SAFE_MODE

All mutating tools disabled by default (`SAFE_MODE=true`). Always-on read-only tools:
`octopus_search_memory`, `octopus_scan_security`, `octopus_read_file`, `octopus_plan_task`,
`octopus_skill_list`, `octopus_llm_complete`, `octopus_browser_snapshot`

**Note:** PreToolUse fatal-command blocks apply **even when `SAFE_MODE=false`** — unconditional.

---

## CI / GitHub Actions

| Secret | Required for |
|---|---|
| `ANTHROPIC_API_KEY` | Claude (default provider) |
| `OPENAI_API_KEY` | GPT-4o |
| `GOOGLE_API_KEY` | Gemini |
| `GITHUB_TOKEN` | Auto-provided — ECC skill library + MarketScout rate limits |

---

## REST API

```
GET  /api/agents              List all 14 agents
GET  /api/memory/search       Query structural memory (L1)
GET  /api/tools/:format       Tools in provider format (anthropic|openai|gemini|ollama|mcp)
POST /api/run                 Run the full agent chain
GET  /instincts               List instincts (confidence, occurrences, category)
POST /instincts               Save an instinct candidate
PATCH /instincts/:id/evolve   Graduate instinct to active skill
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
  agents_marketplace.test.js  — 4 marketplace agents
  commands.test.js            — REST API endpoints
  mcp.test.js                 — MCP server + all 20 tools
  memory.test.js              — 5-layer memory bridge
```

---

## Project Structure

```
Octopus-Agent-System/
├── .github/workflows/octopus.yml
├── node/
│   ├── src/
│   │   ├── agents/               14 agents (Cortex ECC-team-patterns, SecurityReviewer 3-layer)
│   │   ├── skills/
│   │   │   ├── agentshield.js    102-rule 5-category security scanner (NEW)
│   │   │   └── security.js       OWASP Top 10 base scanner
│   │   ├── instincts.js          Continuous Learning v2 — extract/cluster/persist (NEW)
│   │   ├── hooks.js              Pre/PostToolUse/onStop + ECC_HOOK_PROFILE + registerHookGuard
│   │   ├── compress.js           Caveman compression + strategic compaction
│   │   ├── permissions.js        Least-privilege proxy (getInstincts added)
│   │   ├── runner.js             Parallel stages + instinct extraction + compaction hint
│   │   ├── llm.js                Multi-provider gateway + MAX_THINKING_TOKENS cap
│   │   ├── mcp.js                MCP server (AS-A04 agentName validation)
│   │   ├── memory.js             Node↔Python bridge + getInstincts/saveInstinct/evolveInstinct
│   │   └── ...
│   └── skills/auto_generated/    ECC skill summaries + LLM-synthesised skills
├── python/
│   ├── memory/
│   │   ├── context_builder.py    L5 — OCTOPUS.md → ECC rules → Instincts → L1-L3
│   │   ├── schema.py             L2+L3 SQLite + instincts table (NEW)
│   │   └── ...
│   └── services/memory_service.py  Flask + /instincts endpoints (NEW)
├── OCTOPUS.md                    Developer constitution (injected into all agents)
├── CHANGELOG.md
└── README.md
```

---

## Changelog

### 2.0.0 — ECC Fusion
- **AgentShield**: 102-rule 5-category security scanner wired into SecurityReviewer; 3-layer pipeline; `AGENTSHIELD_MODE` env var; self-exclusion for scanner definition files; AS-A04 path traversal fix in `octopus_create_agent`
- **Instincts v2**: session-end pattern extraction; confidence scoring; SQLite `instincts` table; L5 context injection; `/instincts` REST endpoints; skill elevation at confidence ≥ 0.8
- **Strategic Compaction**: `COMPACT_THRESHOLD`/`COMPACT_REMINDER_INTERVAL`; milestone detection; `strategicCompact()` for boundary reduction
- **MAX_THINKING_TOKENS**: caps all LLM completions across 4 providers
- **Parallel QA**: ~75% speedup; `Promise.allSettled` stages; combined gate failure reporting
- **ECC Skill Library**: MarketScout checks ECC first; SKILL.md frontmatter parsing
- **ECC Constitution layer**: OCTOPUS.md → ECC_RULES_PATH → Instincts priority order in L5
- **Hook system**: `ECC_HOOK_PROFILE`; `registerHookGuard` deduplication; quality warnings (console.log, var, any)
- **Cortex**: TDD-first / security-first / research-first / verification-loop routing patterns
- **Permissions**: `getInstincts` added to cortex, forge, architect, securityreviewer, marketscout, toolsmith

### 1.1.0 — Deterministic Guardrails
- Parallel QA execution, least-privilege permissions, OCTOPUS.md constitution, Pre/PostToolUse hooks

### 1.0.0 — Initial Release
- 14 agents, 20 MCP tools, 5-layer memory, self-evolving skill marketplace

---

## License

Apache 2.0 — see [LICENSE](LICENSE).
