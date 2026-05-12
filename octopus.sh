#!/usr/bin/env bash
# octopus.sh — Octopus CLI launcher (Mac/Linux)
# Starts memory service if needed, then launches the interactive CLI.

set -e
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NODE_DIR="$DIR/node"

# Load .env
if [ -f "$NODE_DIR/.env" ]; then
    export $(grep -v '^#' "$NODE_DIR/.env" | grep '=' | xargs -d '\n' 2>/dev/null || true)
fi

# Start memory service if not running
if ! curl -sf http://localhost:5000/health --max-time 2 >/dev/null 2>&1; then
    PY_CMD=$(command -v python3 || command -v python)
    if [ -n "$PY_CMD" ]; then
        "$PY_CMD" "$DIR/python/services/memory_service.py" >/dev/null 2>&1 &
        MEM_PID=$!
        sleep 2
    fi
fi

cleanup() { [ -n "$MEM_PID" ] && kill "$MEM_PID" 2>/dev/null || true; }
trap cleanup EXIT

node "$NODE_DIR/src/cli.js" "$@"
