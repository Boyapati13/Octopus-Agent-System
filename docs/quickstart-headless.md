# Quick Start: Headless Mode (External LLM as Planner)

Use Claude, Cursor, Windsurf, or any MCP-capable LLM as the **primary planner**,
with Octopus as the **tool/safety layer**.

---

## When to use headless mode vs full-brain mode

| | **Full-brain** (default) | **Headless** |
|---|---|---|
| Planner | Cortex (internal) | Your LLM (Claude, GPT-4o, …) |
| Who calls agents | Runner auto-chains | External LLM calls tools |
| AgentShield | Active | Active |
| Gates | Active | Active |
| Best for | Autonomous tasks | Interactive sessions with your AI assistant |
| `HEADLESS_MODE` | `false` | `true` |

In headless mode, your AI assistant (Claude Desktop, Cursor, etc.) **calls Octopus MCP tools directly**: `octopus_search_memory`, `octopus_scan_security`, `octopus_read_file`, `octopus_write_file`, etc. Octopus handles memory, security, file access, and safety — your LLM handles planning and reasoning.

---

## Step 1 — Enable headless mode

**Via CLI:**
```
❯ /headless on
  ⚡ HEADLESS_MODE enabled.
  Restart Octopus for this to take effect.
```

**Via `.env`:**
```env
HEADLESS_MODE=true
SAFE_MODE=false
AGENTSHIELD_MODE=advisory
```

---

## Step 2 — Configure Claude Desktop (recommended)

`~/.config/claude/claude_desktop_config.json` (Mac/Linux)
`%APPDATA%\Claude\claude_desktop_config.json` (Windows)

```json
{
  "mcpServers": {
    "octopus": {
      "command": "node",
      "args": ["/path/to/octopus/node/src/mcp.js"],
      "env": {
        "HEADLESS_MODE": "true",
        "SAFE_MODE": "false",
        "AGENTSHIELD_MODE": "advisory",
        "MEMORY_SERVICE_URL": "http://localhost:5000"
      }
    }
  }
}
```

---

## Step 3 — Start the memory service

```bash
python3 octopus/python/services/memory_service.py
```

Note: In headless mode you don't need to start `node src/server.js` — the MCP server (`mcp.js`) provides all tools directly over stdio.

---

## Step 4 — Use it

In Claude Desktop, you'll see 26 Octopus tools. Example session:

> **You:** Find all files related to authentication in this project.
>
> **Claude:** *[calls octopus_search_memory { "query": "auth" }]*
> I found 3 files: `src/auth.py`, `tests/test_auth.py`, `config/auth.json`.
>
> **You:** Scan `src/auth.py` for security issues.
>
> **Claude:** *[calls octopus_scan_security { "paths": ["src/auth.py"] }]*
> Found 2 issues: missing rate limiting on login endpoint, session tokens not rotated.
>
> **You:** Fix the rate limiting issue.
>
> **Claude:** *[calls octopus_read_file, then octopus_write_file]*
> Added `@rate_limit(max=5, window=60)` decorator to the login endpoint.

---

## Step 5 — Verify

```bash
curl http://localhost:5000/health
# → {"status":"ok","cache_backend":"memory","db":"..."}
```

Check that `/api/tasks/run` correctly blocks:
```bash
curl -X POST http://localhost:3001/api/tasks/run -d '{"task":"test"}' -H "Content-Type: application/json"
# → {"error":"Chain execution disabled in HEADLESS_MODE..."}
```
(Only if the REST server is also running; if using MCP-only, this check isn't needed.)

---

## Cursor / Windsurf / Zed configuration

Any tool that supports MCP servers:
```json
{
  "mcp": {
    "servers": {
      "octopus": {
        "command": "node",
        "args": ["/path/to/octopus/node/src/mcp.js"],
        "env": { "HEADLESS_MODE": "true", "SAFE_MODE": "false" }
      }
    }
  }
}
```

---

## Headless + AgentShield

AgentShield and all gate agents remain fully active in headless mode. When your LLM calls `octopus_scan_security` or `octopus_run_task_chain` (if allowed), the same 102-rule scanner and gate pipeline runs.

To use `octopus_run_task_chain` in headless mode (rarely needed), call Cortex first:
```
octopus_plan_task { "task": "..." }  → preview chain
octopus_run_task_chain { "task": "..." }  → executes (requires HEADLESS_MODE=false or explicit override)
```

---

## Switching back to full-brain mode

```
❯ /headless off
  ✅ HEADLESS_MODE disabled.
  Restart Octopus for this to take effect.
```
