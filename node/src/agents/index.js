'use strict';
/**
 * Agent registry — loads all agents and provides a unified runner.
 * Each agent exports: { name, role, canApprove, run(input, memory) }
 */
const fs   = require('fs');
const path = require('path');
const { compressProse } = require('../compress');

const AGENT_FILES = [
  'cortex', 'atlas', 'architect', 'forge',
  'reviewer', 'securityReviewer', 'factChecker', 'probe', 'scribe', 'releaseKeeper',
  'navigator', 'marketScout', 'toolsmith', 'sandboxQA', 'systemAgent',
];

const _registry = {};

function loadAgents() {
  for (const name of AGENT_FILES) {
    const mod = require(`./${name}`);
    _registry[mod.name.toLowerCase()] = mod;
  }
}

function getAgent(name) {
  return _registry[name.toLowerCase()] || null;
}

function listAgents() {
  return Object.values(_registry).map(a => ({
    name: a.name, role: a.role, canApprove: a.canApprove,
  }));
}

async function runAgent(name, input, memory) {
  const agent = getAgent(name);
  if (!agent) throw new Error(`Unknown agent: ${name}`);
  const result = await agent.run(input, memory);
  // Compress prose fields in every agent response to save output tokens
  if (result && typeof result === 'object') {
    for (const key of ['advice', 'summary', 'rationale', 'notes']) {
      if (typeof result[key] === 'string') result[key] = compressProse(result[key]);
    }
  }
  return result;
}

function injectAgent(name) {
  const agentPath = path.join(__dirname, `${name}.js`);

  // Always flush module cache first — otherwise Node serves the old version
  try {
    delete require.cache[require.resolve(agentPath)];
  } catch { /* file may not have been required before — safe to ignore */ }

  const mod = require(agentPath);

  // Validate agent contract before registering
  const REQUIRED = ['name', 'role', 'canApprove', 'run'];
  const missing  = REQUIRED.filter(k => mod[k] === undefined);
  if (missing.length) {
    throw new Error(`Agent "${name}" is missing required exports: ${missing.join(', ')}`);
  }
  if (typeof mod.run !== 'function') {
    throw new Error(`Agent "${name}" must export run as a function, got ${typeof mod.run}`);
  }

  if (!AGENT_FILES.includes(name)) {
    AGENT_FILES.push(name);
  }
  _registry[mod.name.toLowerCase()] = mod;

  // Persist to disk
  const filePath = __filename;
  let content = fs.readFileSync(filePath, 'utf8');
  if (!content.includes(`'${name}'`)) {
    content = content.replace(
      /(const AGENT_FILES = \[\s*[\s\S]*?)(\s*\];)/,
      `$1, '${name}'$2`
    );
    fs.writeFileSync(filePath, content, 'utf8');
  }
}

loadAgents();
module.exports = { getAgent, listAgents, runAgent, injectAgent };
