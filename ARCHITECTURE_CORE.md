# Octopus Workspace Engine (v5.0-EVO) - Architecture Core

## 1. Multi-Process Execution Architecture
The Octopus system orchestrates intelligence natively on the host machine using dual runtimes tied together by an Inter-Process Communication (IPC) layer based on HTTP + WebSockets.

### Components:
- **Node.js Orchestrator (`node/src/server.js`) | Port 3001**
  - **Runner Loop (`runner.js`):** The engine of the O.P.A.V (Observe, Plan, Act, Verify) framework. Executes sequences grouped into stages (Sequential/Parallel) by the `cortex` planner.
  - **Agent Registry (`agents/index.js`):** Registers logic payloads and exposes an explicit `injectAgent()` factory function to dynamically synthesize and hot-reload micro-agents.
  - **Tool Boundary (`mcp.js`):** Exposes `desktop` control bindings natively via Model Context Protocol (MCP).

- **Python Memory Kernel (`python/services/memory_service.py`) | Port 5000**
  - **State Layer (`memory/schema.py`):** SQLite (`~/.octopus/memory/knowledge_graph.sqlite`) implementation of all structural memory.
  - **Memory Types:**
    - *L1 Structural (Graph):* AST file dependency map, import paths, code boundaries.
    - *L2 Decision (ADR):* Persistent historical logs ensuring architectural continuity (`decisions` table).
    - *L3 Run State:* Real-time iteration state tracking task progress.
    - *L4/L5:* Cache and on-demand assembled context boundaries.
    - *Instincts:* Extracted ML patterns derived dynamically and hot-swapped for optimization (`instincts` table).

- **Native PyQt6 HUD / Desktop Operator (`desktop/octo_desktop.py`)**
  - **Visual Bridge:** Hooks to the Node.js WebSocket stream to display execution. Native voice streams (Gemini Live Audio / PyTTSx3).
  - Routes directly back to the NodeJS orchestrator (`octopus_run_tool`) when deep tasks are initiated.

## 2. Dynamic Agent Factory & Self-Evolution
Octopus does not hardcode its limits. The dynamic factory hot-swaps logic:
1. **Scout & Synthesize (`marketScout.js` -> `toolsmith.js`):** Identify gaps, draft Javascript execution tools, and push them to the `skill_registry.js` sandbox.
2. **QA & Deploy:** Run `sandboxQA.js` on the proposed module.
3. **Hot-Reload:** Once validated, inject into `agents/index.js` and immediately emit the `agent_spawned` WebSocket event payload.

## 3. Communication Rules & State Machine
The UI layer is exclusively driven by the WebSocket event pipeline to enforce the Zero-Yapping rule. Text UI feedback must not be blocked by conversational LLM outputs.
- **WebSocket Protocol Triggers:**
  - `gateway_task_start`: Locks the UI. Transitions UI to `PROCESSING`.
  - `chain_start`: Defines the DAG path for front-end chip rendering.
  - `agent_start` / `agent_output`: Streams raw execution data without summaries.
  - `instinct_new` / `agent_spawned`: UI signal reflecting engine evolution.
  - `chain_done` / `gate_fail`: Terminal states releasing the execution lock and displaying final structured verification results.
