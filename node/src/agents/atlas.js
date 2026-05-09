'use strict';
/**
 * Atlas — Memory
 * Queries the structural graph; returns a ranked file map.
 * Memory-first: never suggests opening files it can answer from index.
 */
const name = 'Atlas';
const role = 'memory';
const canApprove = false;

async function run(input, memory) {
  const { task, query } = input;
  const q = query || task;
  const ctx = await memory.getContext('atlas', task, q);
  const files = ctx ? ctx.relevant_files || [] : await memory.searchStructural(q);

  const canAnswer = files.length > 0;
  return {
    agent: name, role,
    query: q,
    relevant_files: files,
    file_count: files.length,
    can_answer_from_memory: canAnswer,
    advice: canAnswer
      ? `Found ${files.length} relevant file(s). Inspect symbols/summaries before opening raw files.`
      : 'No relevant files in index. Run /onboard to index the repo first.',
  };
}

module.exports = { name, role, canApprove, run };
