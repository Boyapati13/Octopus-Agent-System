#!/usr/bin/env bash
# start_mcp.sh
# Unified startup script: Python memory service + Node MCP server.
# Includes OS-Vault pre-flight check — offers to migrate plain-text .env keys.

set -e
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" &>/dev/null && pwd)"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
log()  { echo -e "  ${GREEN}[OK]${NC}  $*"; }
warn() { echo -e "  ${YELLOW}[WARN]${NC} $*"; }
info() { echo -e "  ${CYAN}[INFO]${NC} $*"; }

# ── OS-Vault Pre-flight Check ──────────────────────────────────────────────────
echo ""
echo "[Octopus] OS-Vault pre-flight check..."

VAULT_CHECK="$DIR/node/src/vault_preflight.js"
VAULT_SET="$DIR/node/src/vault_set.js"
ENV_FILE="$DIR/node/.env"

for PROVIDER in anthropic openai google; do
    # Check vault / session file
    IN_VAULT=0
    if [ -f "$VAULT_CHECK" ]; then
        RESULT=$(node "$VAULT_CHECK" check "$PROVIDER" 2>/dev/null || echo "0")
        [ "$RESULT" = "1" ] && IN_VAULT=1
    fi

    if [ "$IN_VAULT" = "1" ]; then
        log "$PROVIDER: key present in OS Vault"
        continue
    fi

    # Determine the env var name
    case "$PROVIDER" in
        anthropic) ENV_VAR="ANTHROPIC_API_KEY" ;;
        openai)    ENV_VAR="OPENAI_API_KEY"    ;;
        google)    ENV_VAR="GOOGLE_API_KEY"    ;;
    esac

    # Check .env for a non-empty, uncommented value
    ENV_KEY=""
    if [ -f "$ENV_FILE" ]; then
        LINE=$(grep -m1 "^${ENV_VAR}=.\+" "$ENV_FILE" 2>/dev/null || true)
        if [ -n "$LINE" ]; then
            ENV_KEY="${LINE#*=}"
        fi
    fi

    if [ -n "$ENV_KEY" ]; then
        warn "$PROVIDER: key found in plain-text .env"
        printf "         Migrate to OS Vault and clear from .env? [Y/n]: "
        read -r CHOICE
        if [ -z "$CHOICE" ] || [ "$CHOICE" = "Y" ] || [ "$CHOICE" = "y" ]; then
            # Pipe via stdin — never exposes key in process args
            printf '%s' "$ENV_KEY" | node "$VAULT_SET" "$PROVIDER"
            # Scrub value from .env
            if command -v sed &>/dev/null; then
                sed -i.bak "s|^${ENV_VAR}=.*$|${ENV_VAR}=|" "$ENV_FILE" && rm -f "${ENV_FILE}.bak"
            fi
            log "$PROVIDER: plain-text key cleared from .env"
        fi
    else
        info "$PROVIDER: no key configured — run octopus_login to link via Vault"
    fi
done

echo ""

# ── Python Memory Service ──────────────────────────────────────────────────────
echo "[Octopus] Starting Python Memory Service..." >&2
cd "$DIR/python" || exit 1
python services/memory_service.py >/dev/null 2>&1 &
PYTHON_PID=$!

# Wait for the service to bind to port 5000
sleep 2

# ── Node MCP Server ────────────────────────────────────────────────────────────
echo "[Octopus] Starting Node MCP Server..." >&2
cd "$DIR/node" || exit 1
node src/mcp.js

# Cleanup background Python process when Node exits
echo "[Octopus] Cleaning up Python Memory Service..." >&2
kill "$PYTHON_PID" 2>/dev/null || true
