# Quick Start: Local (No Hardware Required)

Run Octopus on your laptop — no Stream Deck+, no voice hardware.
All 14 agents, all 26 MCP tools, the web dashboard, and the CLI work without hardware.

---

## Prerequisites

- Node.js ≥ 18 (≥ 22 recommended)
- Python ≥ 3.11
- One of: API key for Claude/GPT/Gemini, OR Ollama installed locally

---

## 1. Clone and install

```bash
git clone https://github.com/Boyapati13/Octopus-Agent-System.git
cd Octopus-Agent-System/octopus/node
npm install
```

---

## 2. Configure

```bash
cp .env.example .env
```

Edit `node/.env`. Choose **one** LLM option:

### Option A — Claude (recommended, needs API key)
```env
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
```

### Option B — Local Gemma via Ollama (no API key needed)
```bash
# Install Ollama: https://ollama.ai
ollama pull gemma4:e2b
```
```env
LLM_PROVIDER=ollama
LLM_MODEL=gemma4:e2b
SAFE_MODE=false
```

### Option C — JAX/Gemma custom backend
See [quickstart-jax-gemma.md](quickstart-jax-gemma.md)

---

## 3. Start Octopus

**Terminal 1 — Node API + WebSocket:**
```bash
node src/server.js
# Octopus API running on http://localhost:3001
# WebSocket events:   ws://localhost:3001/ws
```

**Terminal 2 — Python memory service:**
```bash
cd ..   # back to octopus/
python3 python/services/memory_service.py    # Mac/Linux
py python/services/memory_service.py         # Windows
```

Or use the bundled launcher (starts both services):
```bash
./start_mcp.sh     # Mac/Linux
.\start_mcp.ps1    # Windows
```

---

## 4. Use the web dashboard

Open in your browser: **http://localhost:3001/dashboard**

The dashboard shows:
- Active chain and current agent (live WebSocket updates)
- Gate agent status (Reviewer, SecurityReviewer, Probe, FactChecker, ReleaseKeeper)
- Event log with timing
- Task input bar — type a prompt and click RUN

---

## 5. Use the CLI

```bash
node src/cli.js
```

Key commands:
```
❯ /plan add dark mode to the settings page    # preview agent chain
❯ add dark mode to the settings page          # plain text = run task
❯ /status                                     # health check
❯ /provider list                              # show all providers
❯ /provider set ollama gemma4:e2b             # switch to local model
❯ /headless on                                # enable headless mode
❯ /dashboard                                  # open web UI
❯ /vault                                      # check API key status
❯ /help                                       # all commands
```

---

## 6. Use as an MCP server

Add to Claude Desktop / Cursor / Windsurf `claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "octopus": {
      "command": "node",
      "args": ["/path/to/octopus/node/src/mcp.js"]
    }
  }
}
```

All 26 tools now appear in your LLM client. Type:
> `Use octopus_search_memory to find the auth module`

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `Cannot GET /api/health` | Start `node src/server.js` |
| Memory errors | Start `python3 python/services/memory_service.py` |
| Sovereign fallback to Ollama | Set your API key in `.env` or run `/vault` → `octopus_login` |
| Chain stuck | Press STOP in dashboard or `/interrupt` in CLI |
