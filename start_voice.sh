#!/usr/bin/env bash
# ── Octopus Voice Service Launcher ───────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo ""
echo "  🐙 Octopus Voice Service"
echo "  Gemini Live ↔ Octopus Agent Bridge"
echo ""

# Check for API key
if [[ -z "${GEMINI_API_KEY:-}" ]]; then
  CONFIG="$SCRIPT_DIR/config/api_keys.json"
  if [[ ! -f "$CONFIG" ]]; then
    echo "  ⚠️  No Gemini API key found."
    echo "  Either:"
    echo "    export GEMINI_API_KEY=your_key"
    echo "    or create config/api_keys.json:"
    echo '    {"gemini_api_key": "your_key"}'
    echo ""
    exit 1
  fi
fi

# Check Python deps
python3 -c "import google.genai, aiohttp, websockets" 2>/dev/null || {
  echo "  📦 Installing Python voice dependencies…"
  pip install google-genai aiohttp websockets --break-system-packages -q
}

echo "  ✅ Starting voice service on ws://localhost:8765"
echo "  ℹ️  Open the Octopus frontend → Voice tab to connect"
echo ""

python3 python/services/voice_service.py
