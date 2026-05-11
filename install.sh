#!/usr/bin/env bash
# Octopus 2.0 — Zero-Key · Universal Mac/Linux Installer
# Works locally (./install.sh) and via one-liner:
#   curl -sSL https://raw.githubusercontent.com/Boyapati13/Octopus-Agent-System/master/install.sh | bash

set -e

REPO_URL="https://github.com/Boyapati13/Octopus-Agent-System.git"
REPO_NAME="Octopus-Agent-System"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; MAGENTA='\033[0;35m'; NC='\033[0m'
log()  { echo -e "  ${GREEN}[octopus]${NC} $*"; }
info() { echo -e "  ${CYAN}[octopus]${NC} $*"; }
warn() { echo -e "  ${YELLOW}[octopus]${NC} $*"; }
head() { echo -e "\n${MAGENTA}$*${NC}"; }

head "🐙 Octopus 2.0 — Zero-Key Installer"
echo "  Self-evolving AI · 14 agents · 21 MCP tools · AgentShield · Zero-Key Auth"
echo ""

# ── Step 1: Clone if running remotely ────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" 2>/dev/null && pwd || echo "")"
if [ -z "$SCRIPT_DIR" ] || [ ! -d "$SCRIPT_DIR/node" ]; then
    DEST="$HOME/$REPO_NAME"
    if [ -d "$DEST" ]; then
        log "Repo exists at $DEST — pulling latest..."
        git -C "$DEST" pull --quiet
    else
        log "Cloning Octopus 2.0 into $DEST..."
        git clone "$REPO_URL" "$DEST" --quiet
    fi
    SCRIPT_DIR="$DEST"
fi

REPO_DIR="$SCRIPT_DIR"
NODE_DIR="$REPO_DIR/node"
MCP_ENTRY="$NODE_DIR/src/mcp.js"
RULES_DIR="$REPO_DIR/.claude/rules"

# ── .gitignore guard ─────────────────────────────────────────────────────────
GITIGNORE="$REPO_DIR/.gitignore"
if [ -f "$GITIGNORE" ]; then
    NEEDS_UPDATE=0
    grep -q '^node/\.env' "$GITIGNORE" || { printf '\nnode/.env\n' >> "$GITIGNORE"; NEEDS_UPDATE=1; }
    grep -q '^\.env'      "$GITIGNORE" || { printf '.env\n'       >> "$GITIGNORE"; NEEDS_UPDATE=1; }
    [ "$NEEDS_UPDATE" -eq 1 ] && warn ".gitignore updated — node/.env protected" || log ".gitignore already guards .env ✅"
fi

# ── Step 2: Node.js dependencies ─────────────────────────────────────────────
head "Step 1/5 — Node.js dependencies"
if ! command -v node &>/dev/null; then
    warn "Node.js not found. Install from https://nodejs.org (LTS) then re-run."
    exit 1
fi
log "Node $(node --version) / npm $(npm --version)"

# keytar native build requirements for Linux (Secret Service provider)
OS="$(uname -s)"
if [ "$OS" = "Linux" ]; then
    if command -v apt-get &>/dev/null; then
        if ! dpkg -l libsecret-1-dev &>/dev/null 2>&1; then
            warn "keytar requires libsecret-1-dev for Linux Secret Service (OS Vault)."
            if [ "$(id -u)" = "0" ]; then
                apt-get install -y libsecret-1-dev -q && log "libsecret-1-dev installed ✅"
            else
                warn "Run: sudo apt-get install -y libsecret-1-dev"
                warn "Then re-run this installer. (Skipping — will fall back to session file auth)"
            fi
        else
            log "libsecret-1-dev present ✅"
        fi
    elif command -v dnf &>/dev/null; then
        rpm -q libsecret-devel &>/dev/null 2>&1 || warn "For OS Vault on Fedora/RHEL run: sudo dnf install -y libsecret-devel"
    elif command -v pacman &>/dev/null; then
        pacman -Q libsecret &>/dev/null 2>&1 || warn "For OS Vault on Arch run: sudo pacman -S libsecret"
    fi
fi

(cd "$NODE_DIR" && npm install --silent)
log "Dependencies installed (keytar, dotenv, and 21-tool MCP stack)"

# ── Step 3: Python dependencies ───────────────────────────────────────────────
head "Step 2/5 — Python dependencies"
PY_CMD=""
for cmd in python3 python; do
    if command -v "$cmd" &>/dev/null; then PY_CMD="$cmd"; break; fi
done
if [ -z "$PY_CMD" ]; then
    warn "Python not found. Install Python 3.9+ then re-run."
    exit 1
fi
log "$PY_CMD $($PY_CMD --version 2>&1)"
$PY_CMD -m pip install -r "$REPO_DIR/python/requirements.txt" -q
log "Python dependencies installed"

# ── Step 4: Create .env (non-sensitive config only) ───────────────────────────
head "Step 3/5 — Configuration"
ENV_FILE="$NODE_DIR/.env"
if [ ! -f "$ENV_FILE" ]; then
    PROVIDER="anthropic"
    MODEL=""
    if curl -sf http://localhost:11434/api/tags --max-time 2 >/dev/null 2>&1; then
        TAGS=$(curl -sf http://localhost:11434/api/tags --max-time 2 2>/dev/null || echo "")
        GEMMA=$(echo "$TAGS" | $PY_CMD -c "import sys,json; d=json.load(sys.stdin); print(next((m['name'] for m in d.get('models',[]) if 'gemma4' in m['name']),''))" 2>/dev/null || echo "")
        if [ -n "$GEMMA" ]; then
            PROVIDER="ollama"; MODEL="$GEMMA"
            log "Auto-configured for Gemma 4: $MODEL"
        else
            FIRST=$(echo "$TAGS" | $PY_CMD -c "import sys,json; d=json.load(sys.stdin); m=d.get('models',[]); print(m[0]['name'] if m else '')" 2>/dev/null || echo "")
            if [ -n "$FIRST" ]; then PROVIDER="ollama"; MODEL="$FIRST"; log "Auto-configured for Ollama: $MODEL"; fi
        fi
    fi

    cat > "$ENV_FILE" <<EOF
# Octopus 2.0 — Zero-Key Configuration
# API keys are NOT stored here — use 'octopus_login' in your AI chat instead.
# Keys are stored securely in the OS Vault (Keychain / Credential Manager / Secret Service).
MEMORY_SERVICE_URL=http://localhost:5000
DATA_DIR=../data
PORT=3001
SAFE_MODE=false

# ECC 2.0 Token Optimization
MAX_THINKING_TOKENS=10000
COMPACT_THRESHOLD=50
COMPACT_REMINDER_INTERVAL=25

# AgentShield
AGENTSHIELD_MODE=advisory
ECC_HOOK_PROFILE=standard

# Project Constitution
PROJECT_ROOT=$REPO_DIR
ECC_RULES_PATH=$RULES_DIR

# LLM Provider (no API key needed — use octopus_login to authorize cloud providers)
LLM_PROVIDER=$PROVIDER
LLM_MODEL=$MODEL
OLLAMA_BASE_URL=http://localhost:11434

# Optional fallback keys (prefer octopus_login — these are plain-text)
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
GOOGLE_API_KEY=
GITHUB_TOKEN=
EOF
    log ".env created (LLM_PROVIDER=$PROVIDER) — API keys go in OS Vault, not here"
else
    log ".env already exists — skipping"
fi

# ── Step 5: ECC rules bootstrap ───────────────────────────────────────────────
mkdir -p "$RULES_DIR"
if [ ! -f "$RULES_DIR/node.md" ]; then
    cat > "$RULES_DIR/node.md" <<'EOF'
---
description: Node.js standards (ECC-aligned, always-loaded)
alwaysApply: true
---
- CommonJS only (no ESM unless .mjs)
- const over let, never var
- console.error for diagnostics — never console.log in MCP stdio paths
- All PreToolUse hooks must complete in under 200ms
EOF
fi
if [ ! -f "$RULES_DIR/security.md" ]; then
    cat > "$RULES_DIR/security.md" <<'EOF'
---
description: Security guardrails (AgentShield-aligned, always-loaded)
alwaysApply: true
---
- Never hardcode secrets — all credentials via OS Vault (octopus_login) or environment variables
- Validate agentName: /^[a-zA-Z][a-zA-Z0-9_]{0,63}$/ before path construction
- No eval(), new Function(), or __proto__ assignments
- All database queries through the memory/repository layer
- AGENTSHIELD_MODE=gate for production deployments
EOF
fi
log "ECC rules bootstrapped (.claude/rules/)"

# ── Step 6: Configure MCP clients ────────────────────────────────────────────
head "Step 4/5 — MCP client registration"

inject_mcp() {
    local cfg="$1" client="$2"
    mkdir -p "$(dirname "$cfg")"
    [ -f "$cfg" ] || echo '{"mcpServers":{}}' > "$cfg"
    $PY_CMD - "$cfg" "$MCP_ENTRY" "$REPO_DIR" "$RULES_DIR" <<'PYEOF'
import sys, json
cfg_path, mcp_path, root, rules = sys.argv[1:5]
with open(cfg_path) as f:
    cfg = json.load(f)
cfg.setdefault('mcpServers', {})['octopus-2'] = {
    'command': 'node',
    'args': [mcp_path],
    'env': {
        'SAFE_MODE': 'false',
        'MAX_THINKING_TOKENS': '10000',
        'COMPACT_THRESHOLD': '50',
        'AGENTSHIELD_MODE': 'advisory',
        'ECC_HOOK_PROFILE': 'standard',
        'PROJECT_ROOT': root,
        'ECC_RULES_PATH': rules,
        'MEMORY_SERVICE_URL': 'http://localhost:5000',
        'LLM_PROVIDER': 'anthropic'
    }
}
with open(cfg_path, 'w') as f:
    json.dump(cfg, f, indent=2)
PYEOF
    log "$client registered → $cfg"
}

INSTALLED=0
case "$(uname -s)" in
    Darwin)
        CLAUDE_DESKTOP="$HOME/Library/Application Support/Claude/claude_desktop_config.json"
        CURSOR_CFG="$HOME/.cursor/mcp.json"
        WIND_CFG="$HOME/.codeium/windsurf/mcp_config.json"
        ;;
    *)
        CLAUDE_DESKTOP="$HOME/.config/Claude/claude_desktop_config.json"
        CURSOR_CFG="$HOME/.config/cursor/mcp.json"
        WIND_CFG="$HOME/.codeium/windsurf/mcp_config.json"
        ;;
esac
CLAUDE_CODE_CFG="$HOME/.claude/settings.json"
CONTINUE_CFG="$HOME/.continue/config.json"

[ -d "$(dirname "$(dirname "$CLAUDE_DESKTOP")")" ] && inject_mcp "$CLAUDE_DESKTOP" "Claude Desktop" && INSTALLED=$((INSTALLED+1)) || true
[ -d "$HOME/.claude" ] && inject_mcp "$CLAUDE_CODE_CFG" "Claude Code" && INSTALLED=$((INSTALLED+1)) || true
{ [ -d "$HOME/.cursor" ] || [ -d "$HOME/.config/cursor" ]; } && inject_mcp "$CURSOR_CFG" "Cursor" && INSTALLED=$((INSTALLED+1)) || true
[ -d "$HOME/.codeium/windsurf" ] && inject_mcp "$WIND_CFG" "Windsurf" && INSTALLED=$((INSTALLED+1)) || true
[ -d "$HOME/.continue" ] && inject_mcp "$CONTINUE_CFG" "Continue.dev" && INSTALLED=$((INSTALLED+1)) || true

[ "$INSTALLED" -eq 0 ] && warn "No LLM client detected — add manually (see DEPLOYMENT.md)" || true

# ── Done ──────────────────────────────────────────────────────────────────────
head "Step 5/5 — Done"
log "Octopus 2.0 installed ($INSTALLED client(s) registered)"
echo ""
info "Zero-Key setup — 3 steps:"
echo "  1. Start services:   ./start_mcp.sh"
echo "  2. Index your repo:  $PY_CMD python/indexer/index_repo.py --root . --db ./data/octopus.db"
echo "  3. In your AI chat:  octopus_login  (choose anthropic / openai / google)"
echo "     → browser opens the API dashboard, you paste the key, it's stored in the OS Vault."
echo ""
info "Local Gemma 4 (no API key, no cloud cost):"
echo "  ollama pull gemma4:e2b"
echo "  LLM_PROVIDER=ollama and LLM_MODEL=gemma4:e2b are already set if Ollama was detected."
echo ""
info "Full deployment guide: $REPO_DIR/DEPLOYMENT.md"
echo ""
