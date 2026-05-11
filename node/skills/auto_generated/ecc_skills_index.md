# ECC Skill Library — Top 10 Imported Skills

Auto-generated index of the first 10 skills pulled from the
[Everything Claude Code](https://github.com/affaan-m/everything-claude-code)
`.agents/skills/` library by MarketScout.

These skills are available as Toolsmith synthesis targets via `octopus_skill_scout`.
Source: `ecc-library` (highest priority in MarketScout deduplication).

---

## 1. security-review

**Source:** `ecc-library` | **Status:** available  
**Description:** Use when adding authentication, handling user input, working with secrets,
creating API endpoints, or implementing payment/sensitive features. Provides comprehensive
security checklist and patterns.  
**Domains:** secrets management, input validation, SQL injection, authentication, XSS,
CSRF, rate limiting, sensitive data exposure, blockchain security, dependency security  
**Pre-deployment:** 17-item checklist covering all OWASP Top 10 categories  
**Doc URL:** https://github.com/affaan-m/everything-claude-code/tree/main/.agents/skills/security-review

---

## 2. tdd-workflow

**Source:** `ecc-library` | **Status:** available  
**Description:** Enforces test-driven development with 80% coverage minimum across unit,
integration, and E2E tests. Activates when writing features, fixing bugs, or refactoring.  
**Workflow:** User story → test cases → fail → implement → pass → refactor → verify coverage  
**Tools:** Playwright for E2E, semantic selectors, test isolation, AAA pattern  
**Doc URL:** https://github.com/affaan-m/everything-claude-code/tree/main/.agents/skills/tdd-workflow

---

## 3. coding-standards

**Source:** `ecc-library` | **Status:** available  
**Description:** Baseline conventions across projects. Readability first, KISS, DRY, YAGNI.
TypeScript/JavaScript, React, API design, file organization standards.  
**Key rules:** `const` over `let`, no `any`, immutability non-negotiable, spread operators,
functions ≤50 lines, no deep nesting, named constants over magic numbers  
**Doc URL:** https://github.com/affaan-m/everything-claude-code/tree/main/.agents/skills/coding-standards

---

## 4. strategic-compact

**Source:** `ecc-library` | **Status:** available  
**Description:** Manual context compaction at logical workflow boundaries. Monitors tool
usage via `suggest-compact.js`, triggers at COMPACT_THRESHOLD (default 50 calls).  
**Compact after:** research phases, completed milestones, debugging sessions, failed approaches  
**Avoid during:** mid-implementation spans, complex multi-step operations  
**Preserves:** CLAUDE.md, TodoWrite lists, memory files, git state  
**Doc URL:** https://github.com/affaan-m/everything-claude-code/tree/main/.agents/skills/strategic-compact

---

## 5. verification-loop

**Source:** `ecc-library` | **Status:** available  
**Description:** Quality assurance pipeline with 6 sequential phases: build verification,
type check, lint check, test suite (80% min), security scan, diff review.  
**Triggers:** after feature completion, before PR, after refactoring  
**Output:** structured report — pass/fail per phase, issue counts, PR readiness  
**Schedule:** every 15 minutes in extended sessions or after major modifications  
**Doc URL:** https://github.com/affaan-m/everything-claude-code/tree/main/.agents/skills/verification-loop

---

## 6. api-design

**Source:** `ecc-library` | **Status:** available  
**Description:** RESTful API design patterns. Consistent `{ success, data, error }` response
envelope, Zod schema validation, proper HTTP verb usage, rate limiting patterns.  
**Doc URL:** https://github.com/affaan-m/everything-claude-code/tree/main/.agents/skills/api-design

---

## 7. backend-patterns

**Source:** `ecc-library` | **Status:** available  
**Description:** Server-side architecture patterns for Node.js/Python backends. Repository
pattern, service layer, error handling, database abstraction, middleware design.  
**Doc URL:** https://github.com/affaan-m/everything-claude-code/tree/main/.agents/skills/backend-patterns

---

## 8. frontend-patterns

**Source:** `ecc-library` | **Status:** available  
**Description:** React/Next.js component patterns. Typed functional components, custom hooks,
lazy loading, memoization, state management patterns, accessibility standards.  
**Doc URL:** https://github.com/affaan-m/everything-claude-code/tree/main/.agents/skills/frontend-patterns

---

## 9. deep-research

**Source:** `ecc-library` | **Status:** available  
**Description:** Research-first development pattern. Multi-source synthesis, fact verification,
citation tracking, structured knowledge extraction before implementation.  
**Doc URL:** https://github.com/affaan-m/everything-claude-code/tree/main/.agents/skills/deep-research

---

## 10. mcp-server-patterns

**Source:** `ecc-library` | **Status:** available  
**Description:** MCP server development patterns. Tool definition schemas, handler structure,
transport configuration, security best practices, testing MCP tools in isolation.  
**Doc URL:** https://github.com/affaan-m/everything-claude-code/tree/main/.agents/skills/mcp-server-patterns

---

## Full ECC Library (32 skills available)

```
agent-introspection-debugging  agent-sort           api-design
article-writing                backend-patterns     brand-voice
bun-runtime                    coding-standards     content-engine
crosspost                      deep-research        dmux-workflows
documentation-lookup           e2e-testing          eval-harness
everything-claude-code         exa-search           fal-ai-media
frontend-patterns              frontend-slides      investor-materials
investor-outreach              market-research      mcp-server-patterns
nextjs-turbopack               product-capability   security-review
strategic-compact              tdd-workflow         verification-loop
video-editing                  x-api
```

To synthesise any skill: `octopus_skill_scout` with the skill name as a topic,
then `octopus_skill_synthesize` with the doc URL above.
