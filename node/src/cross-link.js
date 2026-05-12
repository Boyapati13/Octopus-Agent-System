#!/usr/bin/env node
'use strict';
/**
 * cross-link.js — Universal Adapter Regenerator
 *
 * Reads node/src/tools.js (single source of truth) and regenerates every
 * cross-AI adapter file. Also queries a live Ollama instance if available.
 *
 * Run after adding or changing any tool:
 *   node node/src/cross-link.js
 *
 * Regenerates:
 *   global-config/universal-mcp.json        — Standard MCP manifest
 *   global-config/claude-plugin/plugin.json — Claude Code descriptor
 *   adapters/openai-functions.json          — OpenAI function-calling schema
 *   adapters/gemini-tools.json              — Gemini API tool declarations
 *   adapters/cursor-mcp.json                — Cursor MCP registration
 *   adapters/ollama-config.json             — Ollama model registry + config
 */
const fs    = require('fs');
const path  = require('path');
const http  = require('http');
const { TOOLS } = require('./tools');

const REPO_ROOT     = path.resolve(__dirname, '..', '..');
const GLOBAL_DIR    = path.join(REPO_ROOT, 'global-config');
const CLAUDE_PLUGIN = path.join(GLOBAL_DIR, 'claude-plugin');
const ADAPTERS_DIR  = path.join(REPO_ROOT, 'adapters');
const MCP_ENTRY     = path.join(__dirname, 'mcp.js');

fs.mkdirSync(CLAUDE_PLUGIN, { recursive: true });
fs.mkdirSync(ADAPTERS_DIR,  { recursive: true });

// ── Helpers ────────────────────────────────────────────────────────────────────
function write(relPath, obj) {
  const full = path.join(REPO_ROOT, relPath);
  fs.writeFileSync(full, JSON.stringify(obj, null, 2) + '\n', 'utf8');
  console.log(`[cross-link] ✅  ${relPath}  (${TOOLS.length} tools)`);
}

function toGeminiSchema(schema) {
  if (!schema || !schema.properties) return { type: 'OBJECT', properties: {} };
  const T = { string: 'STRING', number: 'NUMBER', integer: 'INTEGER', boolean: 'BOOLEAN', array: 'ARRAY', object: 'OBJECT' };
  const props = {};
  for (const [k, v] of Object.entries(schema.properties)) {
    props[k] = { type: T[v.type] || 'STRING', description: v.description || '' };
    if (v.type === 'array' && v.items) props[k].items = { type: T[v.items.type] || 'STRING' };
    if (v.enum) props[k].enum = v.enum;
  }
  return { type: 'OBJECT', properties: props, required: schema.required || [] };
}

function httpGet(url) {
  return new Promise((resolve) => {
    const req = http.get(url, { timeout: 2000 }, (res) => {
      let body = '';
      res.on('data', c => { body += c; });
      res.on('end', () => {
        try { resolve(JSON.parse(body)); } catch { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}

// Per-model metadata: tool-calling capability, context window, and best use-case
// Gemma 4 notes: native function-calling built-in, multimodal (text+image+audio on e2b/e4b)
const MODEL_META = {
  // ── Gemma 4 (April 2026 — native function calling, multimodal) ─────────────
  'gemma4:e2b':           { toolCalling: true, ctx: '128K', modal: 'text+image+audio', bestFor: 'Default · Sovereign Fallback · fast, all agents · multimodal' },
  'gemma4:e4b':           { toolCalling: true, ctx: '128K', modal: 'text+image+audio', bestFor: 'Edge/mobile · multimodal · step up from e2b (9.6 GB)' },
  'gemma4:26b':           { toolCalling: true, ctx: '256K', modal: 'text+image',        bestFor: 'MoE — 3.8B active params, 18 GB disk · best for Cortex planning' },
  'gemma4:31b':           { toolCalling: true, ctx: '256K', modal: 'text+image',        bestFor: 'Best local quality · 85.2% MMLU Pro · complex agent chains' },
  'gemma4:31b-cloud':     { toolCalling: true, ctx: '256K', modal: 'text+image',        bestFor: 'Cloud Gemma 4 31B (via Ollama proxy)' },
  // ── Gemma 3 (multimodal, 140 languages) ───────────────────────────────────
  'gemma3:270m':          { toolCalling: false, ctx: '32K',  modal: 'text',            bestFor: 'Minimal footprint (292 MB) — simple chains only' },
  'gemma3:1b':            { toolCalling: false, ctx: '32K',  modal: 'text',            bestFor: 'Tiny/fast — basic tasks (815 MB)' },
  'gemma3:4b':            { toolCalling: true,  ctx: '128K', modal: 'text+image',      bestFor: 'Vision + text · fast iteration (3.3 GB)' },
  'gemma3:12b':           { toolCalling: true,  ctx: '128K', modal: 'text+image',      bestFor: 'Balanced quality + vision (8.1 GB)' },
  'gemma3:27b':           { toolCalling: true,  ctx: '128K', modal: 'text+image',      bestFor: 'Best Gemma 3 · vision · complex tasks (17 GB)' },
  'gemma3:4b-it-qat':     { toolCalling: true,  ctx: '128K', modal: 'text+image',      bestFor: 'QAT — 3x lower memory than 4b, maintained quality' },
  'gemma3:12b-it-qat':    { toolCalling: true,  ctx: '128K', modal: 'text+image',      bestFor: 'QAT — 12b quality at lower memory cost' },
  'gemma3:27b-it-qat':    { toolCalling: true,  ctx: '128K', modal: 'text+image',      bestFor: 'QAT — BF16 quality at reduced memory' },
  // ── Other local models ─────────────────────────────────────────────────────
  'qwen2.5-coder:7b':        { toolCalling: true,  bestFor: 'Code tasks — Forge, Reviewer, SandboxQA' },
  'qwen2.5-coder:1.5b-base': { toolCalling: false, bestFor: 'Fast iteration, simple chains (no tool calling)' },
  'glm-4.7-flash:latest':    { toolCalling: true,  bestFor: 'Best non-Gemma local quality — all agents' },
  'kimi-k2.6:cloud':         { toolCalling: true,  bestFor: 'Cloud — 1T param, best Cortex planning (via Ollama proxy)' },
  'nemotron-3-super:cloud':  { toolCalling: true,  bestFor: 'Cloud — Nvidia Nemotron (via Ollama proxy)' },
  'llama3.2':                { toolCalling: true,  bestFor: 'Minimal footprint, simple task chains' },
  'llama3.1':                { toolCalling: true,  bestFor: 'Tool-calling tasks' },
  'mistral-nemo':            { toolCalling: true,  bestFor: 'European-compliant, multilingual' },
};

// ── Main (async — queries Ollama live) ────────────────────────────────────────
async function main() {
  const OLLAMA_BASE = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';

  // ── Query live Ollama for installed models ────────────────────────────────
  let ollamaModels = [];
  let ollamaOnline = false;
  const tagsData = await httpGet(`${OLLAMA_BASE}/api/tags`);
  if (tagsData && tagsData.models) {
    ollamaOnline = true;
    ollamaModels = tagsData.models.map(m => {
      const meta = MODEL_META[m.name] || { toolCalling: null, bestFor: 'General use' };
      return {
        name:         m.name,
        paramSize:    m.details?.parameter_size || 'unknown',
        quantization: m.details?.quantization_level || 'unknown',
        sizeGb:       m.size ? (m.size / 1e9).toFixed(1) + ' GB' : 'remote',
        family:       m.details?.family || 'unknown',
        isCloud:      m.name.includes(':cloud'),
        toolCalling:  meta.toolCalling,
        bestFor:      meta.bestFor,
      };
    });
    console.log(`[cross-link] Ollama online — ${ollamaModels.length} model(s) detected`);
  } else {
    console.log('[cross-link] Ollama offline — generating ollama-config.json with static model table');
  }

  // ── 1. universal-mcp.json ──────────────────────────────────────────────────
  write('global-config/universal-mcp.json', {
    $schema: 'https://modelcontextprotocol.io/schema/server-manifest.json',
    mcpVersion: '1.0',
    name: 'octopus-2',
    version: '2.0.2',
    description: `Octopus Sovereign Edition — self-evolving AI agent system. ${TOOLS.length} tools, Zero-Key auth, Sovereign Fallback to local Ollama.`,
    homepage: 'https://github.com/Boyapati13/Octopus-Agent-System',
    server: {
      transport: 'stdio',
      command: 'node',
      args: [MCP_ENTRY],
      env: {
        SAFE_MODE: 'false', MAX_THINKING_TOKENS: '10000', COMPACT_THRESHOLD: '50',
        AGENTSHIELD_MODE: 'advisory', ECC_HOOK_PROFILE: 'standard',
        MEMORY_SERVICE_URL: 'http://localhost:5000',
        LLM_PROVIDER: 'ollama', LLM_MODEL: 'gemma4:e2b',
        OLLAMA_BASE_URL: OLLAMA_BASE,
      },
    },
    capabilities: { tools: {} },
    tools: TOOLS.map(t => ({ name: t.name, description: t.description })),
    prerequisite: 'Python memory service must be running on port 5000.',
  });

  // ── 2. claude-plugin/plugin.json ──────────────────────────────────────────
  write('global-config/claude-plugin/plugin.json', {
    _note: 'Claude Code uses MCP stdio. Register in ~/.claude/settings.json — see README.',
    name: 'octopus-2', version: '2.0.2',
    description: `Octopus Sovereign Edition — ${TOOLS.length} tools, Zero-Key auth`,
    entrypoint: MCP_ENTRY, transport: 'stdio',
    connection: { register_in: '~/.claude/settings.json', key: 'mcpServers.octopus-2' },
    tools: TOOLS.map(t => t.name), toolCount: TOOLS.length,
  });

  // ── 3. openai-functions.json ──────────────────────────────────────────────
  write('adapters/openai-functions.json', {
    _note: 'OpenAI function-calling. Pass "tools" to Chat Completions or Assistants API. ChatGPT Desktop does not support MCP.',
    model: 'gpt-4o',
    tools: TOOLS.map(t => ({
      type: 'function',
      function: { name: t.name, description: t.description, parameters: t.inputSchema || { type: 'object', properties: {} } },
    })),
  });

  // ── 4. gemini-tools.json ──────────────────────────────────────────────────
  write('adapters/gemini-tools.json', {
    _note: 'Gemini tool declarations for google.generativeai SDK. Gemini CLI: add geminiCliMcp block to ~/.gemini/config.json.',
    suggestedModel: 'gemini-2.5-pro',
    geminiCliMcp: {
      name: 'octopus-2', command: 'node', args: [MCP_ENTRY],
      env: { SAFE_MODE: 'false', MEMORY_SERVICE_URL: 'http://localhost:5000', OCTOPUS_CALLER: 'gemini' },
    },
    tools: [{ functionDeclarations: TOOLS.map(t => ({ name: t.name, description: t.description, parameters: toGeminiSchema(t.inputSchema) })) }],
  });

  // ── 5. cursor-mcp.json ────────────────────────────────────────────────────
  write('adapters/cursor-mcp.json', {
    _note: 'Merge mcpServers into %APPDATA%\\Cursor\\User\\globalStorage\\mcp.json (Win) or ~/.cursor/mcp.json (Mac/Linux). Then: Cursor → Settings → MCP → Reload.',
    mcpServers: {
      'octopus-2': {
        command: 'node', args: [MCP_ENTRY],
        env: {
          SAFE_MODE: 'false', MAX_THINKING_TOKENS: '10000', AGENTSHIELD_MODE: 'advisory',
          PROJECT_ROOT: REPO_ROOT, ECC_RULES_PATH: path.join(REPO_ROOT, '.claude', 'rules'),
          MEMORY_SERVICE_URL: 'http://localhost:5000',
          LLM_PROVIDER: 'anthropic', OCTOPUS_CALLER: 'cursor',
        },
      },
    },
    toolCount: TOOLS.length, tools: TOOLS.map(t => t.name),
  });

  // ── 6. ollama-config.json ─────────────────────────────────────────────────
  const recommendedModel = ollamaModels.find(m => m.name === 'gemma4:e2b')
    ? 'gemma4:e2b'
    : ollamaModels.find(m => m.toolCalling)?.name || 'gemma4:e2b';

  write('adapters/ollama-config.json', {
    _note: 'Ollama integration config. Set LLM_PROVIDER=ollama and LLM_MODEL=<name> in node/.env or MCP client env block.',
    status: ollamaOnline ? 'online' : 'offline — run: ollama serve',
    base_url: OLLAMA_BASE,
    recommended_model: recommendedModel,
    sovereign_fallback_model: 'gemma4:e2b',
    installed_models: ollamaModels.length > 0 ? ollamaModels : [
      { name: 'gemma4:e2b',  paramSize: '5.1B',  ctx: '128K', modal: 'text+image+audio', toolCalling: true,  bestFor: 'Default — Sovereign Fallback, all agents' },
      { name: 'gemma4:e4b',  paramSize: '~4B',   ctx: '128K', modal: 'text+image+audio', toolCalling: true,  bestFor: 'Edge step-up' },
      { name: 'gemma4:26b',  paramSize: '26B MoE (3.8B active)', ctx: '256K', modal: 'text+image', toolCalling: true, bestFor: 'Cortex planning — fast despite size' },
      { name: 'gemma4:31b',  paramSize: '31B',   ctx: '256K', modal: 'text+image', toolCalling: true,  bestFor: 'Best quality local — 85.2% MMLU Pro' },
      { name: 'gemma3:27b',  paramSize: '27B',   ctx: '128K', modal: 'text+image', toolCalling: true,  bestFor: 'Best Gemma 3, vision, 140 languages' },
      { name: 'qwen2.5-coder:7b', paramSize: '7.6B', toolCalling: true,  bestFor: 'Code tasks — Forge, Reviewer' },
    ],
    env_snippets: {
      default:      { LLM_PROVIDER: 'ollama', LLM_MODEL: 'gemma4:e2b',         OCTOPUS_CALLER: 'ollama' },
      coding:       { LLM_PROVIDER: 'ollama', LLM_MODEL: 'qwen2.5-coder:7b',   OCTOPUS_CALLER: 'ollama' },
      best_quality: { LLM_PROVIDER: 'ollama', LLM_MODEL: recommendedModel,      OCTOPUS_CALLER: 'ollama' },
    },
    open_webui_mcp: {
      _note: 'Open WebUI supports MCP tools. Add this server in Open WebUI → Admin → Tools → Add MCP Server.',
      command: 'node',
      args: [MCP_ENTRY],
      env: { SAFE_MODE: 'false', MEMORY_SERVICE_URL: 'http://localhost:5000', OCTOPUS_CALLER: 'ollama' },
    },
    pull_commands: [
      '# ── Gemma 4 (native function calling + multimodal) ──────────────────',
      'ollama pull gemma4:e2b         # Default · 7.2 GB · text+image+audio · 128K ctx',
      'ollama pull gemma4:e4b         # Step-up · 9.6 GB · text+image+audio · 128K ctx',
      'ollama pull gemma4:26b         # MoE · 18 GB disk / 3.8B active · 256K ctx',
      'ollama pull gemma4:31b         # Best · 20 GB · 85.2% MMLU Pro · 256K ctx',
      '# ── Gemma 3 (vision, 140 languages) ────────────────────────────────',
      'ollama pull gemma3:4b          # Vision · 3.3 GB · 128K ctx',
      'ollama pull gemma3:12b         # Balanced · 8.1 GB · 128K ctx',
      'ollama pull gemma3:27b         # Best Gemma 3 · 17 GB · 128K ctx',
      'ollama pull gemma3:4b-it-qat   # QAT: 3x less memory than gemma3:4b',
      '# ── Coding ──────────────────────────────────────────────────────────',
      'ollama pull qwen2.5-coder:7b   # Forge + Reviewer · 4.7 GB',
    ],
    tools: TOOLS.map(t => t.name),
    toolCount: TOOLS.length,
  });

  console.log(`\n[cross-link] All adapters synced — ${TOOLS.length} tools across 6 target files.\n`);
}

main().catch(err => { console.error('[cross-link] Error:', err.message); process.exit(1); });
