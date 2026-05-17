'use strict';
const fs   = require('fs');
const path = require('path');

const AGENTS_DIR = path.join(__dirname, '..', 'agents');
const NAME_RE    = /^[a-zA-Z][a-zA-Z0-9_]{0,63}$/;

/**
 * Compile and hot-swap a new agent into the running registry.
 *
 * @param {string}   name      - Agent name (must match NAME_RE)
 * @param {string}   code      - Agent module source (CommonJS)
 * @param {Function} broadcast - broadcastEvent(type, data) from server.js
 * @returns {{ name: string, path: string }}
 */
async function compileAndLoadAgent(name, code, broadcast) {
  if (!NAME_RE.test(name)) {
    throw new Error(`Invalid agent name: "${name}" — must match /^[a-zA-Z][a-zA-Z0-9_]{0,63}$/`);
  }

  const filePath = path.join(AGENTS_DIR, `${name}.js`);

  // Write sandboxed agent module to disk (mode 0600 — no group/world read)
  fs.writeFileSync(filePath, code, { encoding: 'utf8', mode: 0o600 });

  // Clear Node require cache so the fresh file is loaded
  const resolved = require.resolve(filePath);
  delete require.cache[resolved];

  // Hot-swap into the live agent registry
  const { injectAgent } = require('../agents');
  injectAgent(name);

  // Broadcast instinct_new so the frontend animates the new agent chip
  if (typeof broadcast === 'function') {
    broadcast('instinct_new', { agent: name, ts: Date.now() });
  }

  return { name, path: filePath };
}

module.exports = { compileAndLoadAgent };
