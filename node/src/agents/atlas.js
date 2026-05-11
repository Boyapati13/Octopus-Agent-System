'use strict';
/**
 * Atlas — Structural Memory Search
 * Queries L1 graph before touching any file. Memory-first: if the answer
 * is in the index, Atlas surfaces it without opening a single file.
 * Ranks results by relevance (path match > symbol match > summary match).
 */
const name = 'Atlas';
const role = 'memory';
const canApprove = false;

const RELEVANCE = { path: 3, symbol: 2, summary: 1 };

function score(entry, q) {
  const ql = q.toLowerCase();
  let s = 0;
  if (entry.path?.toLowerCase().includes(ql))                          s += RELEVANCE.path;
  if ((entry.symbols || []).some(sym => sym.toLowerCase().includes(ql))) s += RELEVANCE.symbol;
  if ((entry.summary  || '').toLowerCase().includes(ql))               s += RELEVANCE.summary;
  return s;
}

async function run(input, memory) {
  const { task, query, limit = 10 } = input;
  const q = query || task || '';

  let files = [];
  try {
    const ctx = await memory.getContext('atlas', task, q);
    files = ctx?.relevant_files || [];
  } catch { /* service offline — fallback below */ }

  // Fallback to direct structural search + local relevance ranking
  if (!files.length) {
    const raw = await memory.searchStructural(q, 20);
    files = (raw || [])
      .map(f => ({ ...f, _score: score(f, q) }))
      .filter(f => f._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, limit);
  }

  const byType = files.reduce((acc, f) => {
    const ext = (f.path || '').split('.').pop() || 'other';
    acc[ext] = (acc[ext] || 0) + 1;
    return acc;
  }, {});

  await memory.writeback(name, {
    run_patch: { task, status: 'memory-searched', notes: [`Atlas: found ${files.length} relevant file(s)`] },
  });

  return {
    agent: name, role, task,
    query: q,
    relevant_files: files.slice(0, limit),
    file_count: files.length,
    by_type: byType,
    can_answer_from_memory: files.length > 0,
    advice: files.length > 0
      ? `Found ${files.length} relevant file(s). Use symbols/summaries before opening raw source.`
      : 'No results in index. Run the repo indexer or broaden the query.',
  };
}

module.exports = { name, role, canApprove, run };
