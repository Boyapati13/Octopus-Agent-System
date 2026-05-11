# Octopus 2.0 — Developer Constitution

This file is injected as the **first key** in every agent's L5 Task Context Profile.
Rules here take absolute precedence over any LLM tendency, learned pattern, or default behavior.
**Hierarchy of truth (highest → lowest):**

```
1. OCTOPUS.md (this file)     — hard project rules, never overridden
2. ECC Rules (.claude/rules/) — language standards, security guardrails
3. Instincts                  — high-confidence learned patterns (confidence ≥ 0.7)
4. L1 Structural Memory       — current codebase graph
5. L2 Decision Memory         — architectural decisions (ADRs)
6. L3 Run State               — current session context
```

---

## Code Standards (ECC-aligned)

- **Never use `var`** — always `const` or `let`
- **Never use TypeScript `any`** — use explicit interfaces or generics
- **Never use `console.log` in production code** — use `console.error` for diagnostics
- **Immutability is non-negotiable** — spread operators (`{...obj}`, `[...arr]`) over mutation
- **Empty catch blocks are forbidden** — always log or re-throw
- **Functions over ~50 lines** — split into smaller units
- **No magic numbers** — extract as named constants
- **Parallel async operations** — always use `Promise.all` or `Promise.allSettled`

## Security Rules (AgentShield-aligned)

- **Never hardcode secrets** — all credentials via environment variables
- **Never use `eval()` or `new Function()`** — code injection risk
- **Never use `MD5` or `SHA1` for passwords** — use `bcrypt` or `crypto.subtle`
- **Never use `Math.random()` for security** — use `crypto.randomBytes()`
- **Always validate agent names** — `/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/` before path construction
- **Never concatenate user input into shell commands** — use parameterized execution
- **SAFE_MODE must not be disabled in CI** — only in local dev with explicit intent

## Architecture Rules

- **Memory writes go through writeback()** — never bypass the Python memory service
- **Gates (canApprove=true) must have real logic** — never unconditionally return `approved: true`
- **Agent names must be registered** — no anonymous agent invocations
- **Parallel QA stage** — Reviewer, SecurityReviewer, Probe, FactChecker always run together
- **TDD-first tasks** — Probe runs BEFORE Forge when task mentions "test" or "TDD"
- **AgentShield mode** — default `advisory`; escalate to `gate` for security-critical deploys

## ECC Integration Rules

- **ECC skills take priority** — MarketScout checks ECC library before npm/PyPI/GitHub
- **Instincts are additive** — never delete an instinct with confidence > 0.5
- **Strategic compaction timing** — only compact at milestone boundaries, never mid-implementation
- **MAX_THINKING_TOKENS** — keep at 10000 unless a specific task requires deeper reasoning
- **Hook profile** — `standard` in development, `strict` in CI/CD

## What Octopus Must Never Do

- Write files outside `PROJECT_ROOT` without explicit user instruction
- Execute `rm -rf`, `DROP DATABASE`, `TRUNCATE TABLE` (non-test) without gate approval
- Inject an agent from an external/unvalidated source
- Disable SAFE_MODE programmatically at runtime
- Skip the AgentShield scan on code that touches auth, payments, or secrets
- Return `approved: true` from a gate agent without checking actual findings
