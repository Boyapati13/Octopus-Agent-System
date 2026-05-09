#!/usr/bin/env bash
# Octopus Agent System — Universal Installer
# Detects your LLM environment and configures the MCP server automatically.
# Supports: Claude Desktop, Cursor, Windsurf, Cline, Continue.dev, VS Code, any MCP client.

set -e

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NODE_DIR="$REPO_DIR/node"
MCP_ENTRY="$NODE_DIR/src/mcp.js"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log()  { echo -e "${GREEN}[octopus]${NC} $*"; }
info() { echo -e "${CYAN}[octopus]${NC} $*"; }
warn() { echo -e "${YELLOW}[octopus]${NC} $*"; }

# ── Detect OS paths ───────────────────────────────────────────────────────────
case "$(uname -s)" in
  Darwin)
    CLAUDE_DESKTOP_CFG="$HOME/Library/Application Support/Claude/claude_desktop_config.json"
    CURSOR_CFG="$HOME/.cursor/mcp.json"
    WINDSURF_CFG="$HOME/.codeium/windsurf/mcp_config.json"
    CONTINUE_CFG="$HOME/.continue/config.json"
    ;;
  Linux)
    CLAUDE_DESKTOP_CFG="$HOME/.config/Claude/claude_desktop_config.json"
    CURSOR_CFG="$HOME/.config/cursor/mcp.json"
    WINDSURF_CFG="$HOME/.codeium/windsurf/mcp_config.json"
    CONTINUE_CFG="$HOME/.continue/config.json"
    ;;
  *)
    warn "Unknown OS. Use install.ps1 on Windows."
    exit 1
    ;;
esac

# ── MCP config block ──────────────────────────────────────────────────────────
mcp_block() {
  cat <<EOF
{
  "command": "node",
  "args": ["$MCP_ENTRY"],
  "env": {
    "SAFE_MODE": "false",
    "LLM_PROVIDER": "anthropic"
  }
}
EOF
}

inject_mcp() {
  local cfg="$1"
  local client="$2"
  mkdir -p "$(dirname "$cfg")"

  if [ ! -f "$cfg" ]; then
    echo '{"mcpServers":{}}' > "$cfg"
  fi

  if command -v python3 &>/dev/null; then
    python3 - "$cfg" "$MCP_ENTRY" <<'PYEOF'
import sys, json
cfg_path, mcp_path = sys.argv[1], sys.argv[2]
with open(cfg_path) as f:
    cfg = json.load(f)
cfg.setdefault('mcpServers', {})['octopus'] = {
    'command': 'node',
    'args': [mcp_path],
    'env': {'SAFE_MODE': 'false', 'LLM_PROVIDER': 'anthropic'}
}
with open(cfg_path, 'w') as f:
    json.dump(cfg, f, indent=2)
PYEOF
    log "Configured Octopus MCP in $client → $cfg"
  else
    warn "python3 not found — manually add to $cfg:"
    mcp_block
  fi
}

# ── Install npm deps ──────────────────────────────────────────────────────────
log "Installing Node dependencies…"
(cd "$NODE_DIR" && npm install --silent)

# ── Install Python deps ───────────────────────────────────────────────────────
log "Installing Python dependencies…"
pip install -r "$REPO_DIR/python/requirements.txt" -q

# ── Install agent-browser Chrome ─────────────────────────────────────────────
if command -v agent-browser &>/dev/null 2>&1 || [ -f "$NODE_DIR/node_modules/.bin/agent-browser" ]; then
  log "Installing Chrome for agent-browser…"
  "$NODE_DIR/node_modules/.bin/agent-browser" install 2>/dev/null || true
fi

# ── Detect and configure clients ─────────────────────────────────────────────
INSTALLED=0

if [ -d "$HOME/Library/Application Support/Claude" ] || [ -d "$HOME/.config/Claude" ]; then
  inject_mcp "$CLAUDE_DESKTOP_CFG" "Claude Desktop"
  INSTALLED=$((INSTALLED+1))
fi

if [ -d "$HOME/.cursor" ] || [ -d "$HOME/.config/cursor" ]; then
  inject_mcp "$CURSOR_CFG" "Cursor"
  INSTALLED=$((INSTALLED+1))
fi

if [ -d "$HOME/.codeium/windsurf" ]; then
  inject_mcp "$WINDSURF_CFG" "Windsurf"
  INSTALLED=$((INSTALLED+1))
fi

if [ -d "$HOME/.continue" ]; then
  inject_mcp "$CONTINUE_CFG" "Continue.dev"
  INSTALLED=$((INSTALLED+1))
fi

if [ "$INSTALLED" -eq 0 ]; then
  warn "No supported LLM client detected. Add manually to your MCP config:"
  echo ""
  echo '  "mcpServers": { "octopus": '"$(mcp_block)"' }'
  echo ""
fi

# ── Print next steps ──────────────────────────────────────────────────────────
echo ""
log "Installation complete! ($INSTALLED client(s) configured)"
echo ""
info "Next steps:"
echo "  1. Set API keys in $NODE_DIR/.env  (copy from .env.example)"
echo "  2. Start services:  ./start_mcp.sh"
echo "  3. Index your repo: python python/indexer/index_repo.py --root . --db ./data/octopus.db"
echo "  4. Restart your LLM client — Octopus tools will appear automatically"
echo ""
info "Tool adapters for direct API use:"
echo "  GET http://localhost:3001/api/tools/openai    # OpenAI function calling"
echo "  GET http://localhost:3001/api/tools/anthropic # Anthropic tool use"
echo "  GET http://localhost:3001/api/tools/gemini    # Gemini function declarations"
