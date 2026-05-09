'use strict';
/**
 * Agent registry — loads all agents and provides a unified runner.
 * Each agent exports: { name, role, canApprove, run(input, memory) }
 */
const fs   = require('fs');
const path = require('path');

const AGENT_FILES = [
  'cortex', 'atlas', 'architect', 'forge',
  'reviewer', 'securityReviewer', 'factChecker', 'probe', 'scribe', 'releaseKeeper',
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
  return agent.run(input, memory);
}

function injectAgent(name) {
  if (!AGENT_FILES.includes(name)) {
    AGENT_FILES.push(name);
  }
  const mod = require(`./${name}`);
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
