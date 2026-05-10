#!/usr/bin/env bash
# scripts/install-hooks.sh
# Copies Octopus git hooks into .git/hooks/ and makes them executable.
# Run once after cloning: bash scripts/install-hooks.sh

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$REPO_ROOT/scripts/git-hooks"
DST="$REPO_ROOT/.git/hooks"

echo "[octopus] Installing git hooks…"
echo "  Source : $SRC"
echo "  Target : $DST"
echo ""

for hook in "$SRC"/*; do
  name="$(basename "$hook")"
  target="$DST/$name"

  if [ -f "$target" ] && [ ! -L "$target" ]; then
    echo "  ⚠️  Existing $name backed up → ${name}.pre-octopus"
    mv "$target" "$target.pre-octopus"
  fi

  cp "$hook" "$target"
  chmod +x "$target"
  echo "  ✅ $name installed"
done

echo ""
echo "[octopus] Done! Configure your LLM provider in node/.env to activate:"
echo ""
echo "  # Option A — Claude (Anthropic)"
echo "  ANTHROPIC_API_KEY=sk-ant-..."
echo ""
echo "  # Option B — GPT-4o (OpenAI)"
echo "  LLM_PROVIDER=openai"
echo "  OPENAI_API_KEY=sk-..."
echo ""
echo "  # Option C — Gemini (Google)"
echo "  LLM_PROVIDER=google"
echo "  GOOGLE_API_KEY=AIza..."
echo ""
echo "  # Option D — Ollama (local, no API key)"
echo "  LLM_PROVIDER=ollama"
echo "  OLLAMA_BASE_URL=http://localhost:11434"
echo "  LLM_MODEL=llama3.2"
