'use strict';
/**
 * Node memory adapter.
 * Primary path: REST calls to Python memory service.
 * Fallback: reads legacy structural_memory.json when service is offline.
 */
const fs   = require('fs');
const path = require('path');
const axios = require('axios');
const { compressProse } = require('./compress');

const MEM_SVC = process.env.MEMORY_SERVICE_URL || 'http://localhost:5000';
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '../../data');

// ── REST helpers ─────────────────────────────────────────────────────────────

async function svcGet(route, params = {}) {
  try {
    const res = await axios.get(`${MEM_SVC}${route}`, { params, timeout: 3000 });
    return res.data;
  } catch {
    return null;
  }
}

async function svcPost(route, body = {}) {
  try {
    const res = await axios.post(`${MEM_SVC}${route}`, body, { timeout: 3000 });
    return res.data;
  } catch {
    return null;
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

async function getContext(agentName, task, query) {
  return svcGet(`/context/${agentName}`, { task, q: query || task });
}

async function searchStructural(q, limit = 10) {
  const result = await svcGet('/structural/search', { q, limit });
  if (result) return result;
  // Fallback: local JSON file
  return findRelevantFiles(loadLocalStructural(), q).slice(0, limit);
}

async function getDecisions(tags, limit = 20) {
  return svcGet('/decisions', { tags: tags ? tags.join(',') : undefined, limit });
}

async function saveDecision(entry) {
  return svcPost('/decisions', entry);
}

async function getRun() {
  return svcGet('/run');
}

async function saveRun(state) {
  return svcPost('/run', state);
}

async function compactSession(summary, facts) {
  return svcPost('/run/compact', { summary, facts });
}

async function writeback(agent, payload) {
  // Compress prose strings before storing to reduce memory token footprint
  const compressed = JSON.parse(JSON.stringify(payload));
  for (const key of ['advice', 'summary', 'rationale', 'notes']) {
    if (typeof compressed[key] === 'string') compressed[key] = compressProse(compressed[key]);
    if (compressed.decision && typeof compressed.decision[key] === 'string')
      compressed.decision[key] = compressProse(compressed.decision[key]);
  }
  return svcPost('/writeback', { agent, ...compressed });
}

async function getCacheStats() {
  return svcGet('/cache/stats');
}

// ── Local fallback (legacy JSON) ──────────────────────────────────────────────

function loadLocalStructural() {
  try {
    return JSON.parse(
      fs.readFileSync(path.join(DATA_DIR, 'structural_memory.json'), 'utf8')
    );
  } catch {
    console.warn('[memory] Memory service offline and no local structural_memory.json found.');
    return [];
  }
}

function findRelevantFiles(structural, query) {
  const q = query.toLowerCase();
  const scored = structural
    .map(entry => {
      let score = 0;
      if (entry.path.toLowerCase().includes(q)) score += 3;
      if ((entry.symbols || []).some(s => s.toLowerCase().includes(q))) score += 2;
      if ((entry.summary || '').toLowerCase().includes(q)) score += 1;
      return { ...entry, relevance_score: score };
    })
    .filter(e => e.relevance_score > 0)
    .sort((a, b) => b.relevance_score - a.relevance_score);
  return scored.slice(0, 10);
}

async function structuralImpact(paths) {
  return svcPost('/structural/impact', { paths });
}

module.exports = {
  getContext, searchStructural, getDecisions, saveDecision,
  getRun, saveRun, compactSession, writeback, getCacheStats,
  findRelevantFiles, loadLocalStructural, structuralImpact,
};
