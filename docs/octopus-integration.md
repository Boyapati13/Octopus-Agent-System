# OctoDeck Integration Guide

This document describes how the Octopus Agent System and AgentDeck surfaces are wired together.

## New Files Added by OctoDeck

### `bridge/src/adapters/octopus-adapter.ts`
The main integration point. Implements `AgentAdapter` so the Octopus system appears as a first-class session type alongside Claude Code, Codex CLI, and OpenClaw.

**How it works:**
1. On `start()`, checks Octopus health (`GET /api/health`)
2. Opens WebSocket to `:3001/ws` for event streaming
3. Maps Octopus events → AgentDeck `AdapterEvent` frames
4. StateMachine receives standard frames — no surface code needs to know about Octopus

### `bridge/src/octopus/octopus-client.ts`
Handles all HTTP and WebSocket communication with the Octopus REST API.

- `planTask(text)` → `POST /api/tasks/plan`
- `runTaskChain(text)` → `POST /api/tasks/run`
- `interruptChain()` → `POST /api/tasks/interrupt`
- `listAgents()` → `GET /api/agents`
- `searchMemory(q)` → `GET /api/memory/search`
- `listInstincts()` → `GET /instincts` (Python service :5000)

### `bridge/src/octopus/octopus-deck-layout.ts`
Defines the 8-key + 4-encoder layout for Octopus sessions on the Stream Deck+.

Key slots: `PLAN(0)`, `RUN(1)`, `STOP(2)`, `AGENTS(3)`, `SECURITY(4)`, `MEMORY(5)`, `INSTINCTS(6)`, `SHIELD(7)`

Encoder slots: `TASK(0)`, `AGENT(1)`, `MEMORY(2)`, `PROVIDER(3)`

The `octopusEventToDeckState()` function maps each Octopus WebSocket event to a partial deck state update (key colors, LCD text).

### `bridge/src/octopus/apme-octopus-bridge.ts`
Closes the learning loop between AgentDeck's APME evaluation system and Octopus's Continuous Learning v2 (Instincts).

Call `apmOctopusBridge.start()` once in `daemon.ts`, then call `onSessionEval(result)` after each APME session evaluation. The bridge automatically extracts instinct candidates from low-scoring categories and posts them to `POST /instincts` on the Octopus memory service.

**Category → Instinct mapping:**
| APME Category | Score Threshold | Instinct Generated |
|---|---|---|
| `test_coverage` | < 0.5 | "Run Probe before Forge for all feature tasks" |
| `security` | < 0.6 | "Route auth/payment tasks through SecurityReviewer first" |
| `factual_accuracy` | < 0.6 | "Prepend FactChecker to research tasks" |
| `code_quality` | < 0.5 | "Always include Reviewer; never skip code quality gate" |
| `documentation` | < 0.5 | "Include Scribe at end of every task chain" |
| `architecture` | < 0.6 | "Route structural changes through Architect before Forge" |
| `performance` | < 0.5 | "Use Promise.allSettled for parallel QA gates" |

## Event Flow

```
User presses RUN on Stream Deck+
  → plugin sends PluginCommand { type: "send_prompt", text: "..." }
  → OctopusAdapter._handleSendPrompt()
  → OctopusClient.planTask() → plan shown on LCD strip
  → OctopusClient.runTaskChain()
  → Octopus engine: Cortex → Atlas → Forge → [parallel QA] → Scribe
  → WebSocket events: chain_start, agent_start×N, gate_fail?, chain_done
  → OctopusAdapter maps each event → AdapterEvent
  → StateMachine processes AdapterEvent → StateSnapshot
  → BridgeCore broadcasts StateSnapshot → all 13 surfaces update
  → APME records session timeline
  → apmOctopusBridge.onSessionEval() → extracts instincts → POST /instincts
  → Next Octopus chain uses improved instinct-enriched L5 context
```

## Adding Octopus to Your AgentDeck Setup

1. Start Octopus: `./octopus/start_mcp.sh`
2. Launch AgentDeck with Octopus session: `agentdeck octopus`
3. Or add `"agentType": "octopus"` in `config/default-settings.json`

No changes required to any surface code — the adapter layer handles everything.
