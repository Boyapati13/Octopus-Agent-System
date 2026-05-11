#!/usr/bin/env node
'use strict';
/**
 * cross-link.js — Universal Adapter Regenerator
 *
 * Reads node/src/tools.js (single source of truth) and regenerates every
 * cross-AI adapter file so they stay in sync with the core tool definitions.
 *
 * Run after adding or changing any tool:
 *   node node/src/cross-link.js
 *
 * Regenerates:
 *   global-config/universal-mcp.json    — Standard MCP manifest (all clients)
 *   global-config/claude-plugin/plugin.json — Claude Code integration descriptor
 *   adapters/openai-functions.json      — OpenAI Assistants API / function-calling
 *   adapters/gemini-tools.json          — Gemini API tool declarations
 *   adapters/cursor-mcp.json            — Cursor MCP registration snippet
 */
const fs   = require('fs');
const path = require('path');
const { TOOLS } = require('./tools');

const REPO_ROOT     = path.resolve(__dirname, '..', '..');
const GLOBAL_DIR    = path.join(REPO_ROOT, 'global-config');
const CLAUDE_PLUGIN = path.join(GLOBAL_DIR, 'claude-plugin');
const ADAPTERS_DIR  = path.join(REPO_ROOT, 'adapters');
const MCP_ENTRY     = path.join(__dirname, 'mcp.js');

fs.mkdirSync(CLAUDE_PLUGIN, { recursive: true });
fs.mkdirSync(ADAPTERS_DIR,  { recursive: true });

// ── Gemini schema converter (JSON Schema → Gemini FunctionDeclaration params) ──
function toGeminiSchema(schema) {
  if (!schema || !schema.properties) return { type: 'OBJECT', properties: {} };
  const TYPE_MAP = { string: 'STRING', number: 'NUMBER', integer: 'INTEGER', boolean: 'BOOLEAN', array: 'ARRAY', object: 'OBJECT' };
  const props = {};
  for (const [key, val] of Object.entries(schema.properties)) {
    props[key] = { type: TYPE_MAP[val.type] || 'STRING', description: val.description || '' };
    if (val.type === 'array' && val.items) props[key].items = { type: TYPE_MAP[val.items.type] || 'STRING' };
    if (val.enum) props[key].enum = val.enum;
  }
  return { type: 'OBJECT', properties: props, required: schema.required || [] };
}

function write(relPath, obj) {
  const full = path.join(REPO_ROOT, relPath);
  fs.writeFileSync(full, JSON.stringify(obj, null, 2) + '\n', 'utf8');
  console.log(`[cross-link] ✅  ${relPath}  (${TOOLS.length} tools)`);
}

// ── 1. universal-mcp.json — Standard MCP Manifest ────────────────────────────
write('global-config/universal-mcp.json', {
  $schema: 'https://modelcontextprotocol.io/schema/server-manifest.json',
  mcpVersion: '1.0',
  name: 'octopus-2',
  version: '2.0.1',
  description: `Octopus Sovereign Edition — self-evolving AI agent system with ${TOOLS.length} tools. Zero-Key auth, Sovereign Fallback to local Ollama, 14 specialist agents.`,
  homepage: 'https://github.com/Boyapati13/Octopus-Agent-System',
  server: {
    transport: 'stdio',
    command: 'node',
    args: [MCP_ENTRY],
    env: {
      SAFE_MODE: 'false',
      MAX_THINKING_TOKENS: '10000',
      COMPACT_THRESHOLD: '50',
      AGENTSHIELD_MODE: 'advisory',
      ECC_HOOK_PROFILE: 'standard',
      MEMORY_SERVICE_URL: 'http://localhost:5000',
      LLM_PROVIDER: 'ollama',
      LLM_MODEL: 'gemma4:e2b',
      OLLAMA_BASE_URL: 'http://localhost:11434',
    },
  },
  capabilities: { tools: {} },
  tools: TOOLS.map(t => ({ name: t.name, description: t.description })),
  prerequisite: 'Python memory service must be running on port 5000 before starting this server.',
});

// ── 2. Claude Code plugin descriptor ─────────────────────────────────────────
write('global-config/claude-plugin/plugin.json', {
  _note: 'Claude Code uses MCP stdio transport. Register in ~/.claude/settings.json — see README Connect section.',
  name: 'octopus-2',
  version: '2.0.1',
  description: `Octopus Sovereign Edition — ${TOOLS.length} tools, Zero-Key auth, Sovereign Fallback`,
  entrypoint: MCP_ENTRY,
  transport: 'stdio',
  connection: {
    register_in: '~/.claude/settings.json',
    key: 'mcpServers.octopus-2',
  },
  tools: TOOLS.map(t => t.name),
  toolCount: TOOLS.length,
});

// ── 3. openai-functions.json — OpenAI Assistants API / function calling ───────
write('adapters/openai-functions.json', {
  _note: 'OpenAI function-calling schema. Pass the "tools" array to Chat Completions or Assistants API. ChatGPT Desktop does not support MCP — use this schema with the API directly.',
  model: 'gpt-4o',
  tools: TOOLS.map(t => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: t.inputSchema || { type: 'object', properties: {} },
    },
  })),
});

// ── 4. gemini-tools.json — Gemini API tool declarations ───────────────────────
write('adapters/gemini-tools.json', {
  _note: 'Gemini tool declarations. Pass the "tools" array to google.generativeai SDK. Gemini CLI MCP support: add to ~/.gemini/config.json as an mcpServer entry.',
  suggestedModel: 'gemini-2.5-pro',
  geminiCliMcp: {
    name: 'octopus-2',
    command: 'node',
    args: [MCP_ENTRY],
    env: { SAFE_MODE: 'false', MEMORY_SERVICE_URL: 'http://localhost:5000', OCTOPUS_CALLER: 'gemini' },
  },
  tools: [{
    functionDeclarations: TOOLS.map(t => ({
      name: t.name,
      description: t.description,
      parameters: toGeminiSchema(t.inputSchema),
    })),
  }],
});

// ── 5. cursor-mcp.json — Cursor MCP registration ──────────────────────────────
write('adapters/cursor-mcp.json', {
  _note: 'Cursor MCP registration. Merge the mcpServers block into %APPDATA%\\Cursor\\User\\globalStorage\\mcp.json (Windows) or ~/.cursor/mcp.json (Mac/Linux). Then: Cursor → Settings → MCP → Reload.',
  mcpServers: {
    'octopus-2': {
      command: 'node',
      args: [MCP_ENTRY],
      env: {
        SAFE_MODE: 'false',
        MAX_THINKING_TOKENS: '10000',
        AGENTSHIELD_MODE: 'advisory',
        PROJECT_ROOT: REPO_ROOT,
        ECC_RULES_PATH: path.join(REPO_ROOT, '.claude', 'rules'),
        MEMORY_SERVICE_URL: 'http://localhost:5000',
        LLM_PROVIDER: 'anthropic',
        OCTOPUS_CALLER: 'cursor',
      },
    },
  },
  toolCount: TOOLS.length,
  tools: TOOLS.map(t => t.name),
});

console.log(`\n[cross-link] All adapters synced — ${TOOLS.length} tools across 5 target files.\n`);
