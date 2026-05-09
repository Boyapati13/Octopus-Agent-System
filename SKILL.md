# Octopus Agent System — Skill

Memory-first agent harness with 11 specialist agents, 5-layer memory architecture,
browser control, multi-LLM gateway, and universal tool adapters for any LLM.

## Trigger

Invoke this skill when the user types `/octopus` or asks to:
- Plan or decompose a feature/task
- Search indexed memory for files or symbols
- Run the full agent chain on a task
- Scan security vulnerabilities
- Navigate or interact with a webpage
- Check past architectural decisions
- Switch or query the active LLM provider
- Install Octopus on another LLM tool

---

## Workflow

### 1. Check server availability
Before any action, verify Octopus is running:
```
GET http://localhost:3001/api/health
```
If unavailable, guide the user to run the installer:
- **Windows:** `.\install.ps1`
- **Mac/Linux:** `./install.sh`

### 2. Load memory context
Always start by querying memory before opening files:
```
octopus_search_memory { "query": "<user's topic>" }
```

### 3. Plan the task
```
octopus_plan_task { "task": "<user's task description>" }
```
Show the agent plan to the user. Ask for approval before running.

### 4. Execute (with approval)
```
octopus_run_task_chain { "task": "<task>" }
```
Gate agents (Reviewer, SecurityReviewer, FactChecker, Probe, ReleaseKeeper) will
halt the chain automatically if their checks fail.

### 5. Compact at end of session
```
octopus_compact_session { "summary": "...", "facts": ["..."] }
```

---

## Available Tools

| Tool | Description |
|---|---|
| `octopus_plan_task` | Cortex decomposes task into agent plan |
| `octopus_run_task_chain` | Full chain: plan → agents → gates → compact |
| `octopus_search_memory` | L1 graph search (files, symbols, summaries) |
| `octopus_get_decisions` | L2 architectural decision log |
| `octopus_compact_session` | Promote run state to long-term memory |
| `octopus_execute_command` | Run shell commands in workspace |
| `octopus_read_file` | Read workspace file |
| `octopus_write_file` | Write workspace file |
| `octopus_create_agent` | Hot-reload a new specialist agent |
| `octopus_scan_security` | OWASP Top 10 file scan |
| `octopus_llm_complete` | Send prompt to active LLM provider |
| `octopus_browser_navigate` | Open URL + capture accessibility snapshot |
| `octopus_browser_snapshot` | Snapshot active browser page |
| `octopus_browser_interact` | Click / fill / eval on active page |

---

## Installing on another LLM

### Get tools in any format
```
GET http://localhost:3001/api/tools/openai     # OpenAI function calling
GET http://localhost:3001/api/tools/anthropic  # Anthropic tool use
GET http://localhost:3001/api/tools/gemini     # Gemini function declarations
GET http://localhost:3001/api/tools/mcp        # Raw MCP inputSchema
```

### Programmatic usage
```js
const { getTools } = require('./node/src/adapters');

// OpenAI
const openai = new OpenAI();
await openai.chat.completions.create({
  model: 'gpt-4o',
  tools: getTools('openai'),
  messages: [{ role: 'user', content: 'Plan this feature...' }],
});

// Anthropic
const anthropic = new Anthropic();
await anthropic.messages.create({
  model: 'claude-opus-4-7',
  tools: getTools('anthropic'),
  messages: [{ role: 'user', content: 'Plan this feature...' }],
});

// Gemini
const { GoogleGenerativeAI } = require('@google/generative-ai');
const genai = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
const model = genai.getGenerativeModel({
  model: 'gemini-2.0-flash',
  tools: [getTools('gemini')],
});
```

---

## Agents

| Agent | Role | Gate |
|---|---|---|
| Cortex | Planner — dynamic task decomposition | ✓ |
| Atlas | Memory — ranked structural search | |
| Architect | Architecture — boundary impact analysis | |
| Forge | Implementation — scoped edit plans | |
| FactChecker | Verification — grounding gate | ✓ |
| Reviewer | Quality gate | ✓ |
| SecurityReviewer | Security gate | ✓ |
| Probe | Test coverage gate | ✓ |
| Scribe | Documentation + changelog | |
| ReleaseKeeper | Final release gate | ✓ |
| Navigator | Browser — web navigation + capture | |

---

## Memory Architecture

```
L5 Task Context Profile  — ephemeral, per-agent, built on demand
L4 Prompt Cache          — Redis/Valkey optional, in-memory fallback
L3 Run State             — SQLite session tables + session compaction
L2 Decision Memory       — SQLite append-only, versioned ADRs
L1 Structural Memory     — SQLite graph facts + NetworkX runtime reasoning
```
