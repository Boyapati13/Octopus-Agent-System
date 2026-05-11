# Octopus 2.0 — Deployment Guide (Zero-Key)

**Zero-Key architecture:** API keys are never stored in `.env`. They live in the OS Vault (Windows Credential Manager / macOS Keychain / Linux Secret Service) and are retrieved at runtime by the `getSecureKey` cascade resolver.

**Three-step setup:**
1. Run the installer (or `.\start_mcp.ps1` / `./start_mcp.sh`)
2. Start the MCP stack
3. Type `octopus_login` in your AI chat → browser opens the API dashboard → paste your key once

---

## Step 1 — Install

**Windows (one-liner)**
```powershell
powershell -ExecutionPolicy Bypass -Command "iex (irm https://raw.githubusercontent.com/Boyapati13/Octopus-Agent-System/master/install.ps1)"
```

**Mac / Linux (one-liner)**
```bash
curl -sSL https://raw.githubusercontent.com/Boyapati13/Octopus-Agent-System/master/install.sh | bash
```

The installer handles everything: Node + Python deps, `.env` (non-sensitive config), ECC rules, and MCP client registration for Claude Desktop, Claude Code, Cursor, Windsurf, and Continue.dev.

> **Linux note:** `keytar` requires `libsecret` for the Linux Secret Service. The installer will prompt if it's missing:
> ```bash
> sudo apt-get install -y libsecret-1-dev    # Debian/Ubuntu
> sudo dnf install -y libsecret-devel        # Fedora/RHEL
> ```
> If unavailable, keys fall back to `~/.octopus/sessions.json` (mode 0600).

---

## Step 2 — Start the Stack

**Windows**
```powershell
.\start_mcp.ps1
```

**Mac / Linux**
```bash
./start_mcp.sh
```

Both scripts run a **vault pre-flight check** before starting services. If a key is found in plain-text `.env`, you'll be offered an automatic migration to the OS Vault.

Or start services individually:
```bash
# Terminal 1 — Python memory service (port 5000)
python python/services/memory_service.py

# Terminal 2 — Node MCP server
cd node && npm run mcp

# Terminal 3 — REST API (optional)
cd node && npm run serve
```

---

## Step 3 — Authorize via octopus_login

In any AI chat with Octopus connected, type:
```
octopus_login
```
Then choose a provider: `anthropic`, `openai`, or `google`.

**What happens:**
1. The agent-browser opens the provider's API key dashboard
2. A masked input window appears (or clear Authorize instructions on Linux)
3. Paste your API key — it's written to the OS Vault immediately
4. The `.env` file is **never modified**

Dashboard URLs:
- Anthropic → `https://console.anthropic.com/settings/keys`
- OpenAI → `https://platform.openai.com/api-keys`
- Google → `https://aistudio.google.com/app/apikey`

**Linux manual authorize (if no GUI):**
```bash
node node/src/vault_set.js anthropic
# Masked prompt appears — paste key, press Enter
```
Or pipe directly:
```bash
echo "your-key" | node node/src/vault_set.js anthropic
```

---

## Step 4 — Index the Repository

```bash
python python/indexer/index_repo.py --root . --db ./data/octopus.db
```

Verify:
```bash
python -c "import sqlite3; c=sqlite3.connect('data/octopus.db'); print([r[0] for r in c.execute(\"SELECT name FROM sqlite_master WHERE type='table'\")])"
```

---

## MCP Client Configuration (manual)

If the installer didn't auto-register your client, add this to your MCP config file:

**Claude Desktop / Claude Code / Cursor / Windsurf** (`~/.claude/settings.json`, `claude_desktop_config.json`, etc.)

```json
{
  "mcpServers": {
    "octopus-2": {
      "command": "node",
      "args": ["/absolute/path/to/Octopus-Agent-System/node/src/mcp.js"],
      "env": {
        "SAFE_MODE": "false",
        "MAX_THINKING_TOKENS": "10000",
        "COMPACT_THRESHOLD": "50",
        "AGENTSHIELD_MODE": "advisory",
        "ECC_HOOK_PROFILE": "standard",
        "PROJECT_ROOT": "/absolute/path/to/Octopus-Agent-System",
        "ECC_RULES_PATH": "/absolute/path/to/Octopus-Agent-System/.claude/rules",
        "MEMORY_SERVICE_URL": "http://localhost:5000",
        "LLM_PROVIDER": "anthropic"
      }
    }
  }
}
```

> **Windows paths:** replace `/absolute/path/...` with `C:\\Users\\YourName\\Octopus-Agent-System\\...` (double backslashes in JSON).

**Note:** `LLM_PROVIDER` tells Octopus which provider to use. The API key is retrieved from the OS Vault automatically — do **not** add `ANTHROPIC_API_KEY` or similar keys here.

---

## Verify the Server

```bash
node /path/to/Octopus-Agent-System/node/src/mcp.js
# Output: [mcp] Octopus Server started on stdio
# (Press Ctrl+C to stop)
```

Test the vault key retrieval:
```bash
cd node
node -e "require('./src/llm').getSecureKey('anthropic').then(k => console.log(k ? 'Key found ✅' : 'No key — run octopus_login'))"
```

---

## Local Gemma 4 (No API Key)

```bash
ollama pull gemma4:e2b    # ~3 GB VRAM — fast, good for most tasks
ollama pull gemma4:9b     # ~8 GB VRAM — best for Cortex planning
```

In `node/.env`:
```env
LLM_PROVIDER=ollama
LLM_MODEL=gemma4:e2b
OLLAMA_BASE_URL=http://localhost:11434
```

Or set in the MCP env block: `"LLM_PROVIDER": "ollama", "LLM_MODEL": "gemma4:e2b"`.

---

## Environment Variables Reference

| Variable | Default | Description |
|---|---|---|
| `LLM_PROVIDER` | `anthropic` | `anthropic` · `openai` · `google` · `ollama` |
| `LLM_MODEL` | provider default | Model override |
| `MAX_THINKING_TOKENS` | `Infinity` | Token cap per call — set `10000` for ECC optimisation |
| `COMPACT_THRESHOLD` | `50` | Tool calls before strategic compaction hint |
| `SAFE_MODE` | `true` | `false` to enable mutating tools |
| `AGENTSHIELD_MODE` | `advisory` | `none` · `advisory` · `gate` |
| `ECC_HOOK_PROFILE` | `standard` | `minimal` · `standard` · `strict` |
| `PROJECT_ROOT` | `.` | Repo root for OCTOPUS.md + instinct paths |
| `ECC_RULES_PATH` | `.claude/rules` | Always-loaded ECC guardrail rules |
| `MEMORY_SERVICE_URL` | `http://localhost:5000` | Python memory service |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama server URL |

**API keys (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_API_KEY`) should NOT be set in env blocks or `.env`.** Use `octopus_login` — keys are stored in the OS Vault and retrieved automatically by the 4-tier `getSecureKey` cascade.

---

## Troubleshooting

| Issue | Cause | Fix |
|---|---|---|
| `octopus_login` says "Key not found after login" | User closed PS window without entering key | Re-run `octopus_login` and complete the masked prompt |
| `getSecureKey` returns null | Key not in vault, env, or .env | Run `octopus_login` or `node src/vault_set.js <provider>` |
| `MODULE_NOT_FOUND: keytar` | Native build failed | Linux: install `libsecret-1-dev`; then `npm install` in `node/` |
| `python` not found | Python not in PATH | Use `py` (Windows) or `python3` |
| MCP tools not appearing | Config path wrong | Verify `mcp.js` absolute path, double `\\` on Windows |
| Memory service 503 | Flask not running | Start `python python/services/memory_service.py` first |
| Instincts table missing | DB not initialized | Run the indexer or start the memory service |
| AgentShield not blocking | SAFE_MODE=true | Set `SAFE_MODE=false` in env or MCP config |
| Linux: vault unavailable | libsecret not installed | Install it, or use `~/.octopus/sessions.json` fallback |
| `PROJECT_ROOT` not set | Env var missing | Add to MCP config `env` block |
