'use strict';
/**
 * Instincts — Continuous Learning v2 (ECC-port)
 *
 * Extracts recurring patterns from agent run notes at session compaction.
 * Stores them as L2 decisions tagged ['instinct'] with a confidence score.
 * High-confidence instincts (≥ 0.8) are elevated to MarketScout proposals.
 *
 * Mirrors ECC's homunculus/instincts pattern with the Octopus L2 store.
 */
const axios = require('axios');

const MEM_SVC = process.env.MEMORY_SERVICE_URL || 'http://localhost:5000';
const TIMEOUT  = 4000;

// ── Confidence scoring ────────────────────────────────────────────────────────

// Minimum occurrences before an instinct is persisted
const MIN_OCCURRENCES  = 2;
// Confidence threshold to elevate an instinct to a skill candidate
const SKILL_THRESHOLD  = 0.8;

// Signal keywords that suggest an insight worth remembering
const SIGNAL_PATTERNS = [
  { re: /always use|never use|prefer\b/i,        weight: 0.3, category: 'convention' },
  { re: /parallel|Promise\.all|concurrent/i,     weight: 0.25, category: 'performance' },
  { re: /security|xss|injection|owasp/i,         weight: 0.3,  category: 'security' },
  { re: /test.first|tdd|coverage/i,              weight: 0.2,  category: 'testing' },
  { re: /compact|token|context.limit/i,          weight: 0.2,  category: 'optimization' },
  { re: /pattern|convention|standard/i,          weight: 0.15, category: 'architecture' },
  { re: /mistake|error|bug.found|avoid/i,        weight: 0.25, category: 'anti-pattern' },
  { re: /gate.*fail|fail.*gate|blocked by/i,     weight: 0.3,  category: 'gate-insight' },
];

// ── Extraction ────────────────────────────────────────────────────────────────

/**
 * Extract instinct candidates from a list of session run notes.
 * Returns an array of candidate objects with confidence scores.
 */
function extractCandidates(notes = []) {
  const candidates = [];

  for (const note of notes) {
    if (typeof note !== 'string' || note.length < 20) continue;

    let confidence = 0.3; // baseline
    let category   = 'general';

    for (const { re, weight, category: cat } of SIGNAL_PATTERNS) {
      if (re.test(note)) {
        confidence = Math.min(1.0, confidence + weight);
        category   = cat;
        break; // first match wins for category
      }
    }

    if (confidence >= 0.4) {
      candidates.push({
        pattern:     note.slice(0, 300),
        confidence:  Math.round(confidence * 100) / 100,
        category,
        occurrences: 1,
      });
    }
  }

  return candidates;
}

// ── Deduplication (cluster similar instincts) ─────────────────────────────────

function similarity(a, b) {
  const wordsA = new Set(a.toLowerCase().split(/\W+/).filter(w => w.length >= 3));
  const wordsB = new Set(b.toLowerCase().split(/\W+/).filter(w => w.length >= 3));
  if (!wordsA.size || !wordsB.size) return 0;
  const intersection = [...wordsA].filter(w => wordsB.has(w)).length;
  return intersection / Math.max(wordsA.size, wordsB.size);
}

function cluster(candidates) {
  const clustered = [];
  for (const c of candidates) {
    const existing = clustered.find(e => similarity(e.pattern, c.pattern) >= 0.55);
    if (existing) {
      existing.occurrences++;
      existing.confidence = Math.min(1.0, existing.confidence + 0.1);
    } else {
      clustered.push({ ...c });
    }
  }
  return clustered.filter(c => c.occurrences >= MIN_OCCURRENCES || c.confidence >= 0.7);
}

// ── Persistence (L2 decisions tagged 'instinct') ──────────────────────────────

async function persistInstinct(instinct, source = 'session') {
  try {
    await axios.post(`${MEM_SVC}/instincts`, instinct, { timeout: TIMEOUT });
  } catch {
    // Fallback: persist via existing /decisions endpoint with instinct tag
    try {
      await axios.post(`${MEM_SVC}/decisions`, {
        title:     `[Instinct] ${instinct.pattern.slice(0, 80)}`,
        rationale: JSON.stringify({
          confidence:  instinct.confidence,
          occurrences: instinct.occurrences,
          category:    instinct.category,
          source,
        }),
        tags: ['instinct', instinct.category],
        risk: instinct.confidence >= SKILL_THRESHOLD ? 'low' : 'info',
      }, { timeout: TIMEOUT });
    } catch { /* memory service offline — skip */ }
  }
}

// ── Skill elevation ───────────────────────────────────────────────────────────

/**
 * High-confidence instincts become MarketScout skill proposals.
 * Returns proposals array (may be empty).
 */
function elevateToSkillProposals(instincts) {
  return instincts
    .filter(i => i.confidence >= SKILL_THRESHOLD)
    .map(i => ({
      type:         'instinct',
      source:       'instinct-evolution',
      name:         `instinct_${i.category}_${Date.now()}`,
      display_name: `Instinct: ${i.pattern.slice(0, 50)}`,
      description:  i.pattern,
      doc_url:      null,
      reason:       `High-confidence instinct (${i.confidence}) — evolved from ${i.occurrences} occurrences`,
      keywords:     ['instinct', i.category],
      confidence:   i.confidence,
    }));
}

// ── Main entry ────────────────────────────────────────────────────────────────

/**
 * Called at session compaction (end of runTask).
 * Extracts, clusters, persists instincts from the session's agent results.
 *
 * @param {object} results - full results object from runner.runTask()
 * @returns {object} { instincts, skill_proposals }
 */
async function processSession(results) {
  const allNotes = [];

  for (const [, agentResult] of Object.entries(results.results || {})) {
    if (agentResult?.advice) allNotes.push(agentResult.advice);
    if (Array.isArray(agentResult?.findings)) {
      agentResult.findings.forEach(f => f.issue && allNotes.push(f.issue));
    }
  }
  for (const err of results.errors || []) {
    if (err.error) allNotes.push(`Avoid: ${err.error}`);
  }

  const candidates      = extractCandidates(allNotes);
  const clustered       = cluster(candidates);
  const skillProposals  = elevateToSkillProposals(clustered);

  // Persist all in parallel, fire-and-forget
  await Promise.allSettled(clustered.map(i => persistInstinct(i, results.task)));

  if (clustered.length > 0) {
    console.error(`[instincts] Extracted ${clustered.length} instinct(s), ${skillProposals.length} elevated to skill proposals`);
  }

  return { instincts: clustered, skill_proposals: skillProposals };
}

module.exports = { processSession, extractCandidates, cluster, elevateToSkillProposals, SKILL_THRESHOLD };
