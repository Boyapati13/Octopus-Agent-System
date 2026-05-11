#!/usr/bin/env bash

# start_mcp.sh
# Unified startup script to launch the Python memory service and Node MCP server

# Get the directory of this script
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

echo "[Octopus] Starting Python Memory Service..." >&2
cd "$DIR/python" || exit 1
python services/memory_service.py > /dev/null 2>&1 &
PYTHON_PID=$!

# Wait for the service to bind to port 5000
sleep 2

echo "[Octopus] Starting Node MCP Server..." >&2
cd "$DIR/node" || exit 1
node src/mcp.js

# Cleanup background Python process when Node exits
kill $PYTHON_PID
