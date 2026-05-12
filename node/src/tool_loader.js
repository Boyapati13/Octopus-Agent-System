'use strict';
/**
 * Tool Plugin Loader
 *
 * Discovers and loads tool plugins from the tools/ directory.
 * Each plugin is a directory containing:
 *   tool.json  — manifest (name, description, input/output schema, safety tier)
 *   index.js   — handler: module.exports = async function run(input) { ... }
 *
 * Safety tiers:
 *   read-only  — no side effects; always allowed
 *   mutating   — writes or modifies state; blocked in SAFE_MODE
 *   high-risk  — destructive or privileged; requires gate approval
 *
 * Tools registered here are available via:
 *   MCP stdio  — via mcp.js
 *   REST API   — GET /api/tools/:format and POST /api/tools/call/:name
 */
const fs   = require('fs');
const path = require('path');

const TOOLS_DIR  = path.join(__dirname, '..', '..', 'tools');
const SAFE_MODE  = process.env.SAFE_MODE !== 'false';

const _toolRegistry = {};   // name → { manifest, run }

function loadTools() {
  if (!fs.existsSync(TOOLS_DIR)) return;

  for (const entry of fs.readdirSync(TOOLS_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(TOOLS_DIR, entry.name);
    const manifestPath = path.join(dir, 'tool.json');
    const handlerPath  = path.join(dir, 'index.js');

    if (!fs.existsSync(manifestPath) || !fs.existsSync(handlerPath)) continue;

    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      const run = require(handlerPath);

      if (!manifest.name || typeof run !== 'function') {
        console.error(`[tool_loader] Skipping ${entry.name}: missing name or default export function`);
        continue;
      }

      _toolRegistry[manifest.name] = { manifest, run };
      console.error(`[tool_loader] Loaded plugin: ${manifest.name} (${manifest.safety_tier || 'read-only'})`);
    } catch (err) {
      console.error(`[tool_loader] Failed to load ${entry.name}: ${err.message}`);
    }
  }
}

function listTools() {
  return Object.values(_toolRegistry).map(t => t.manifest);
}

function getTool(name) {
  return _toolRegistry[name] || null;
}

async function callTool(name, input) {
  const tool = getTool(name);
  if (!tool) throw new Error(`Unknown tool plugin: ${name}`);

  const tier = tool.manifest.safety_tier || 'read-only';

  if (SAFE_MODE && (tier === 'mutating' || tier === 'high-risk')) {
    throw new Error(`Tool "${name}" requires safety_tier=${tier} but SAFE_MODE is enabled`);
  }

  return tool.run(input);
}

loadTools();

module.exports = { listTools, getTool, callTool };
