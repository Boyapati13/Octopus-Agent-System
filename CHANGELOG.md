# Changelog

All notable changes to the Octopus Agent System are documented in this file.
Format: [Semantic Versioning](https://semver.org) · Scribe agent standard.

---

## [2.0.0-rc.1] — 2026-05-11 — Octopus 2.0 ECC Fusion

### Summary
Full integration of the [Everything Claude Code (ECC)](https://github.com/affaan-m/everything-claude-code)
ecosystem. Octopus 2.0 absorbs ECC's 195+ skills, 102-rule AgentShield, Continuous Learning v2
(Instincts), Strategic Compaction, and parallel QA execution into the core agent runtime.

### ⚡ Performance
- **~75% QA speedup** via parallel stage execution: Reviewer, SecurityReviewer, Probe, and
  FactChecker now run simultaneously in a single `Promise.allSettled` stage instead of
  sequentially. All gate failures are collected and reported together.
- **~60% token cost reduction** via `MAX_THINKING_TOKENS` cap (default: 10 000) applied
  to all LLM providers (Anthropic, OpenAI, Google, Ollama) and Strategic Compaction
  (`COMPACT_THRESHOLD=50`, `COMPACT_REMINDER_INTERVAL=25`).

### 🛡️ Security
- **AgentShield** (`node/src/skills/agentshield.js`): 102-rule static security scanner
  across 5 categories — secrets (14), permissions (20), hook injection (15), MCP risk (15),
  agent config (15), code quality (23). Self-exclusion prevents scanner rule literals from
  false-positiving on their own patterns.
- **3-layer security pipeline** in SecurityReviewer:
  - Layer 1: PreToolUse hook — synchronous, zero tokens, fatal OS patterns
  - Layer 2: OWASP Top 10 quick patterns + AgentShield 5-category source scan
  - Layer 3: `AGENTSHIELD_MODE=gate` — full blocking on critical AS findings
- **`registerHookGuard(id)`**: session-scoped deduplication lock prevents double-firing
  when both Octopus and ECC hook layers are active.
- **AS-A04 fix**: `octopus_create_agent` now validates `agentName` against
  `/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/` before path construction (path traversal prevention).
- **AS-Q01 fix**: All `console.log` calls replaced with `console.error` in MCP stdio paths
  (`runner.js`, `server.js`) to prevent stdout corruption of the MCP protocol channel.

### 🧠 Continuous Learning v2
- **Instincts** (`node/src/instincts.js`): session-end pattern extraction, confidence
  scoring, word-overlap clustering, and SQLite persistence via `POST /instincts`.
- **Instincts table** added to `python/memory/schema.py` with upsert semantics —
  revisiting a pattern increments `occurrences` and boosts `confidence` by +0.05.
- **L5 context injection**: agents with `instincts` in their profile (cortex, forge,
  architect, security-reviewer, marketscout, toolsmith) receive top-10 patterns
  (confidence ≥ 0.7) prepended to their context.
- **Skill elevation**: instincts reaching confidence ≥ 0.8 are promoted to MarketScout
  skill proposals and can be graduated via `PATCH /instincts/:id/evolve`.
- **New REST endpoints**: `GET /instincts`, `POST /instincts`, `PATCH /instincts/:id/evolve`.

### 📚 ECC Integration
- **MarketScout**: checks ECC `.agents/skills/` library (32 skills) before npm/PyPI/GitHub;
  parses SKILL.md frontmatter for descriptions; tags proposals `source: 'ecc-library'`.
- **ECC skills index** (`node/skills/auto_generated/ecc_skills_index.md`): top 10 skills
  with descriptions, trigger conditions, and doc URLs; full 32-skill inventory.
- **ECC Constitution layer**: `ECC_RULES_PATH` env var points to `.claude/rules/*.md` —
  always-loaded language/security guardrails injected into every agent's L5 context.
- **Context hierarchy** (highest → lowest priority):
  `OCTOPUS.md → ECC Rules → Instincts → L1 Structural → L2 Decisions → L3 Run State`

### 🤖 Agent Improvements
- **Cortex**: TDD-first (Probe before Forge), security-first, research-first, and
  verification-loop routing patterns added to both LLM prompt and keyword fallback.
- **ECC_HOOK_PROFILE**: `minimal|standard|strict` strictness levels — standard adds
  `console.log`, `var`, and `any` quality warnings; strict adds XSS and crypto checks.
- **Least-privilege permissions**: `getInstincts` added to cortex, forge, architect,
  securityreviewer, marketscout, toolsmith allowlists.

### 🔧 Developer Constitution
- **OCTOPUS.md** created at repo root — injected as first key in every agent's L5 context;
  defines hierarchy of truth, code standards, security rules, and architecture invariants.

### Known Warnings (non-blocking, documented)
| Rule | File | Reason |
|---|---|---|
| AS-A06 | `agents/index.js:53` | `delete require.cache` is the hot-reload mechanism for dynamic agent injection — by design |
| AS-A06 | `agents/sandboxQA.js:27` | Skill sandbox reload via require cache — by design |
| AS-Q20 | `hooks.js:95` | `/Math\.random\s*\(\s*\)/g` is a detection regex literal, not a real `Math.random()` call |

---

## [1.1.0] — 2026-05-11 — Deterministic Guardrails

- Parallel QA stage execution (initial implementation)
- Least-privilege memory proxy per agent
- OCTOPUS.md constitution injection (initial)
- Pre/PostToolUse hooks with auto-format
- `PERMISSION_DENIED` error kind

---

## [1.0.0] — 2026-05-10 — Initial Release

- 14 specialist agents (Cortex, Atlas, Architect, Forge, Reviewer, SecurityReviewer,
  FactChecker, Probe, Scribe, ReleaseKeeper, Navigator, MarketScout, Toolsmith, SandboxQA)
- 20 MCP tools
- 5-layer memory (L1 structural graph, L2 decisions, L3 run state, L4 cache, L5 context)
- Self-evolving skill marketplace (4-phase: scout → synthesise → validate → deploy)
- Multi-LLM gateway: Anthropic, OpenAI, Google, Ollama
- SAFE_MODE, auto-agent synthesis, session compaction
- GitHub Actions CI/CD pipeline
