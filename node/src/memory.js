'use strict';
/**
 * Node Memory Adapter
 * Primary path : REST calls to the Python memory service (port 5000).
 * Fallback      : local structural_memory.json when service is offline.
 * All prose values are compressed before storage to save token budget.
 */
const fs   = require('fs');
const path = require('path');
const axios = require('axios');
const { compressProse } = require('./compress');

const MEM_SVC  = process.env.MEMORY_SERVICE_URL || 'http://localhost:5000';
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '../../data');
const TIMEOUT  = 4000;

// ── REST helpers ──────────────────────────────────────────────────────────────

async function svcGet(route, params = {}) {
  try {
    const res = await axios.get(`${MEM_SVC}${route}`, { params, timeout: TIMEOUT });
    return res.data;
  } catch (e) {
    if (e.code !== 'ECONNREFUSED') console.warn(`[memory] GET ${route}: ${e.message}`);
    return null;
  }
}

async function svcPost(route, body = {}) {
  try {
    const res = await axios.post(`${MEM_SVC}${route}`, body, { timeout: TIMEOUT });
    return res.data;
  } catch (e) {
    if (e.code !== 'ECONNREFUSED') console.warn(`[memory] POST ${route}: ${e.message}`);
    return null;
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

async function getContext(agentName, task, query) {
  return svcGet(`/context/${agentName}`, { task, q: query || task });
}

async function searchStructural(q, limit = 10) {
  if (!q) return [];
  const result = await svcGet('/structural/search', { q, limit });
  if (result) return Array.isArray(result) ? result : [];
  return findRelevantFiles(loadLocalStructural(), q).slice(0, limit);
}

async function getDecisions(tags, limit = 20) {
  return svcGet('/decisions', { tags: Array.isArray(tags) ? tags.join(',') : tags, limit }) || [];
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

async function compactSession(summary, facts = []) {
  return svcPost('/run/compact', { summary, facts });
}

async function writeback(agent, payload) {
  // Compress prose strings before storing
  const compressed = JSON.parse(JSON.stringify(payload));
  const PROSE_KEYS = ['advice', 'summary', 'rationale', 'note', 'notes'];
  for (const key of PROSE_KEYS) {
    if (typeof compressed[key] === 'string')
      compressed[key] = compressProse(compressed[key]);
    if (compressed.decision && typeof compressed.decision[key] === 'string')
      compressed.decision[key] = compressProse(compressed.decision[key]);
    if (compressed.approval && typeof compressed.approval[key] === 'string')
      compressed.approval[key] = compressProse(compressed.approval[key]);
  }
  return svcPost('/writeback', { agent, ...compressed });
}

async function getCacheStats() {
  return svcGet('/cache/stats') || {};
}

async function structuralImpact(paths) {
  return svcPost('/structural/impact', { paths }) || [];
}

// ── Local fallback ────────────────────────────────────────────────────────────

function loadLocalStructural() {
  try {
    const fpath = path.join(DATA_DIR, 'structural_memory.json');
    return JSON.parse(fs.readFileSync(fpath, 'utf8'));
  } catch {
    return [];
  }
}

function findRelevantFiles(structural, query) {
  const q = query.toLowerCase();
  return structural
    .map(entry => {
      let score = 0;
      if ((entry.path     || '').toLowerCase().includes(q)) score += 3;
      if ((entry.symbols  || []).some(s => s.toLowerCase().includes(q))) score += 2;
      if ((entry.summary  || '').toLowerCase().includes(q)) score += 1;
      return { ...entry, relevance_score: score };
    })
    .filter(e => e.relevance_score > 0)
    .sort((a, b) => b.relevance_score - a.relevance_score)
    .slice(0, 10);
}

module.exports = {
  getContext, searchStructural, getDecisions, saveDecision,
  getRun, saveRun, compactSession, writeback, getCacheStats,
  structuralImpact, findRelevantFiles, loadLocalStructural,
};
