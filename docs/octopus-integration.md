# OctoDeck Integration Guide

This document is the authoritative reference for wiring the Octopus Agent System to AgentDeck surfaces.

---

## Architecture

```
AgentDeck Bridge                          Octopus Agent System
─────────────────                         ────────────────────
OctopusAdapter                            REST API  :3001
  ↕ AdapterEvent                          WebSocket  :3001/ws
OctopusClient ─── HTTP/WS ────────────►  Node engine
                                          Python memory  :5000
OctopusDeckLayout                         Flask /instincts :5000
  → Stream Deck+ key colors / LCD
ApmOctopusBridge                          Continuous Learning v2
  → POST /instincts ────────────────────► Instincts table
```

---

## Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| Node.js | ≥ 18 | ≥ 22 recommended |
| Python | ≥ 3.11 | For memory service |
| npm / pnpm | any | pnpm for full monorepo |
| Stream Deck+ | hardware optional | TUI/Android/iOS work without it |

---

## Quick Setup

### Terminal 1 — Octopus backend

```bash
cd octopus-agent-system/octopus/node
cp .env.example .env
# Edit .env: set LLM_PROVIDER and API key (or use Ollama — no key needed)

npm install
node src/server.js          # REST + WebSocket on :3001

# In a separate shell start the Python memory service:
cd ..
python3 python/services/memory_service.py    # Mac/Linux
py python/services/memory_service.py         # Windows
```

Or use the bundled launcher:
```bash
./start_mcp.sh      # Mac/Linux
.\start_mcp.ps1     # Windows
```

### Terminal 2 — AgentDeck bridge

```bash
# From the monorepo root
pnpm install && pnpm build
agentdeck octopus
```

Or add to `config/default-settings.json`:
```json
{ "agentType": "octopus" }
```

---

## REST API Reference

All endpoints are on `http://localhost:3001`.

| Method | Path | Description |
|---|---|---|
| GET | `/api/health` | Liveness check + chain status + cache stats |
| GET | `/api/status` | Detailed chain / session status (dashboard) |
| GET | `/api/agents` | List all registered agents |
| POST | `/api/tasks/plan` | Run Cortex only; return the planned agent chain |
| POST | `/api/tasks/run` | Start full chain; events stream on WS `/ws` |
| POST | `/api/tasks/interrupt` | Interrupt the running chain |
| POST | `/api/tasks/voice` | Voice-friendly task: accepts `{ text }`, returns short summary |
| POST | `/api/security/scan` | Run AgentShield scan: `{ target: "<file or snippet>" }` |
| GET | `/api/memory/search?q=` | L1 structural memory search |
| GET | `/api/memory/decisions` | L2 architectural decision log (ADRs) |
| GET | `/api/llm/provider` | Current LLM provider and model |
| GET | `/api/tools/:format` | Tool declarations: `anthropic`, `openai`, `gemini`, `mcp` |
| GET | `/api/plugins` | List loaded tool plugins |
| POST | `/api/plugins/call/:name` | Call a tool plugin by name |

### `POST /api/tasks/plan` response
```json
{
  "task": "Add dark mode support",
  "agents": ["Atlas", "Architect", "Forge", "Reviewer", "SecurityReviewer", "Probe", "FactChecker", "Scribe"],
  "pattern": "default"
}
```

### `POST /api/tasks/run` response
```json
{ "ok": true, "task": "Add dark mode support", "message": "Chain started — follow events on /ws" }
```

---

## WebSocket Event Reference

Connect to `ws://localhost:3001/ws`. All messages are JSON.

| Event type | Payload | When |
|---|---|---|
| `connected` | `{}` | On WS connection open |
| `chain_start` | `{ task, plan: string[] }` | Chain begins; plan is ordered agent names |
| `agent_start` | `{ agent, role }` | Agent is spawned |
| `agent_done` | `{ agent, approved, notes: string[] }` | Agent completed |
| `gate_fail` | `{ agent, reason }` | Gate agent rejected the chain |
| `chain_done` | `{ task, success, duration_ms }` | Chain finished (success or fail) |
| `tool_call` | `{ tool, args }` | Agent made a tool call |
| `compaction` | `{ session_tool_calls }` | Context compaction suggested |
| `instinct_new` | `{ id, pattern, confidence, occurrences }` | New instinct extracted |
| `voice_summary` | `{ summary, success }` | Voice task TTS-ready summary |
| `disconnected` | `{}` | WS connection closed |

### Example WebSocket client (Node.js)
```js
const WS = require('ws');
const ws = new WS('ws://localhost:3001/ws');
ws.on('message', raw => {
  const ev = JSON.parse(raw);
  console.log(ev.type, ev.data);
});
```

---

## Stream Deck+ Key Mapping

Pressing a key fires the following sequence:

| Key | Action | WS events produced |
|---|---|---|
| **PLAN** | `POST /api/tasks/plan` with current prompt | — |
| **RUN** | `POST /api/tasks/run` | `chain_start → agent_start* → gate_fail? → chain_done` |
| **STOP** | `POST /api/tasks/interrupt` | `chain_done { success: false, interrupted: true }` |
| **SECURITY** | `POST /api/security/scan` | — |
| **MEMORY** | `GET /api/memory/search?q=` (E3 encoder value) | — |
| **INSTINCTS** | `GET /instincts` (Python :5000) | — |
| **SHIELD** | Cycles `AGENTSHIELD_MODE` via env / config | — |
| **AGENTS** | `GET /api/agents` | — |

Key colors are updated by `octopusEventToDeckState()` in `octopus-deck-layout.ts`:

| Color | State |
|---|---|
| Blue `#1F4E79` | Planning |
| Amber `#F0A500` | Running |
| Green `#00C853` | Gate pass |
| Red `#D32F2F` | Gate fail / error |
| Orange `#E65100` | Security scan |
| Grey `#424242` | Idle |
| Dark `#1A1A1A` | Disabled (STOP when idle) |

---

## APME → Instincts Feedback Loop

Enable by importing and calling `startApmeBridge()` in `daemon.ts`:

```ts
import { apmOctopusBridge } from './octopus/apme-octopus-bridge.js';

await apmOctopusBridge.start();   // checks Python memory service health

// After each APME evaluation:
await apmOctopusBridge.onSessionEval(apmeResult);
```

**Category thresholds that generate instincts:**

| APME Category | Threshold | Instinct |
|---|---|---|
| `test_coverage` | < 0.5 | Run Probe before Forge (TDD-first) |
| `security` | < 0.6 | SecurityReviewer first for auth/payment tasks |
| `factual_accuracy` | < 0.6 | FactChecker before implementation |
| `code_quality` | < 0.5 | Always include Reviewer |
| `documentation` | < 0.5 | Always include Scribe |
| `architecture` | < 0.6 | Architect before Forge for structural changes |
| `performance` | < 0.5 | Use Promise.allSettled for parallel QA |

Instincts post to `POST http://localhost:5000/instincts`.  
When `confidence ≥ 0.8`, they graduate to active skills.

---

## Headless Mode (External LLM as Planner)

Set `HEADLESS_MODE=true` in `node/.env` when using Claude Desktop, Cursor, or Windsurf as the primary planner and Octopus as the tool/safety layer.

**Claude Desktop config (`claude_desktop_config.json`):**
```json
{
  "mcpServers": {
    "octopus": {
      "command": "node",
      "args": ["/path/to/octopus/node/src/mcp.js"],
      "env": {
        "HEADLESS_MODE": "true",
        "SAFE_MODE": "false",
        "AGENTSHIELD_MODE": "advisory"
      }
    }
  }
}
```

In headless mode:
- `POST /api/tasks/plan` and `POST /api/tasks/run` return `403 Forbidden`
- The external LLM calls `octopus_*` MCP tools directly (`octopus_search_memory`, `octopus_scan_security`, `octopus_read_file`, etc.)
- Cortex is only invoked if explicitly called via `octopus_plan_task`
- AgentShield and all safety gates remain fully active

---

## Voice → Octopus → Surfaces

End-to-end flow:

```
Wake word detected (Porcupine / Apple SFSpeech)
  → Recognized text sent to AgentDeck
  → OctopusAdapter.handleCommand({ type: 'send_prompt', text })
  → POST http://localhost:3001/api/tasks/voice { text }
  → Chain runs (Cortex → agents → gates)
  → WS event: voice_summary { summary, success }
  → AgentDeck surfaces update (LCD strip, TUI, Android card)
  → Optional TTS: speak voice_summary.summary
```

Text-in / text-out contract:
- **Input**: `POST /api/tasks/voice { "text": "refactor the auth module" }`
- **Output** (via WS): `{ type: "voice_summary", data: { "summary": "Task complete in 12.4 seconds. 6 agents ran.", "success": true } }`

---

## Tool Plugins

Add new tools by creating a directory under `tools/`:

```
tools/
  my-tool/
    tool.json     ← manifest
    index.js      ← handler: module.exports = async (input) => result
```

**`tool.json` schema:**
```json
{
  "name": "my_tool",
  "display_name": "My Tool",
  "description": "What this tool does",
  "safety_tier": "read-only",
  "input_schema": { "type": "object", "properties": { ... }, "required": [] },
  "output_schema": { "type": "object", "properties": { ... } }
}
```

**Safety tiers:**
- `read-only` — always available
- `mutating` — blocked when `SAFE_MODE=true`
- `high-risk` — blocked when `SAFE_MODE=true`; requires gate approval

Plugins are auto-loaded on server startup. Call via `POST /api/plugins/call/:name`.

---

## Known Limitations

| Limitation | Status |
|---|---|
| One chain at a time (sequential, no parallel chains) | Roadmap: multi-chain view |
| Voice ASR/TTS not implemented in Octopus | AgentDeck handles ASR; Octopus is text-in/text-out |
| Stream Deck+ requires AgentDeck full install | TUI / REST work standalone |
| STOP button kills the chain state but cannot cancel an in-flight LLM call | Future: streaming abort via AbortController |
| Windows: `keytar` native module requires Visual C++ Build Tools | Install from visualstudio.com/build-tools |

---

## Troubleshooting

**Pressing PLAN/RUN returns 404:**
Check that the server is running with the updated `server.js`. The old server had `/api/task/run` (singular). The new routes are `/api/tasks/plan`, `/api/tasks/run`, `/api/tasks/interrupt`.

**WebSocket events not received:**
The WS server is on the same port as REST (3001). Verify the server started correctly — it should log `WebSocket events: ws://localhost:3001/ws`. The old server used plain `app.listen()` which doesn't support WS upgrades; the new server uses `httpServer.listen()`.

**`OctopusClient` import error in bridge:**
`bridge/src/adapters/octopus-adapter.ts` previously imported `'./octopus-client.js'` (wrong). Fixed to `'../octopus/octopus-client.js'`.

**Octopus is not running error:**
Run `GET http://localhost:3001/api/health`. If it fails:
1. Start the Node server: `cd octopus/node && node src/server.js`
2. Start the Python memory service: `python3 octopus/python/services/memory_service.py`

**Gate fail shown as permission prompt:**
This is intentional. `gate_fail` events map to `permission_prompt` in the AgentDeck state machine so the Stream Deck+ shows a red alert key. Press AGENTS to acknowledge.
