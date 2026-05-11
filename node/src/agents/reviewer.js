'use strict';
/**
 * Reviewer — Code Quality Gate
 * Checks changed files against the structural index.
 * Flags: missing tests, files not in index, high churn, docs gaps.
 * GATE: sets approved=false to stop the chain.
 */
const name = 'Reviewer';
const role = 'review';
const canApprove = true;

const MIN_COVERAGE_FILES = 1; // at least 1 test file must exist per changed source file

async function run(input, memory) {
  const { task } = input;

  const ctx     = await memory.getContext('reviewer', task, task);
  const runState = ctx?.run_state || await memory.getRun() || {};
  const changed  = runState.changed_files || [];
  const allFiles = ctx?.relevant_files   || [];

  const issues  = [];
  const untested = [];
  const notIndexed = [];

  for (const f of changed) {
    // Skip non-source files
    if (/\.(md|json|yml|yaml|txt|lock)$/.test(f)) continue;

    const indexed = allFiles.find(af => af.path === f);
    if (!indexed) {
      notIndexed.push(f);
      issues.push(`${f}: not in structural index (run indexer after changes)`);
    }

    const isTest = /test|spec/i.test(f);
    if (!isTest) {
      const hasTest = allFiles.some(af =>
        /test|spec/i.test(af.path) &&
        (af.symbols || []).some(s => s.toLowerCase().includes(f.split('/').pop().replace(/\.\w+$/, '').toLowerCase()))
      );
      if (!hasTest) {
        untested.push(f);
        issues.push(`${f}: no corresponding test file found`);
      }
    }
  }

  // Check for doc updates when source files change
  const sourceChanged = changed.filter(f => /\.(js|ts|py)$/.test(f) && !/test/i.test(f));
  const docsUpdated   = changed.some(f => /readme|changelog|\.md$/i.test(f));
  if (sourceChanged.length > 2 && !docsUpdated) {
    issues.push(`${sourceChanged.length} source files changed but no docs updated (README/CHANGELOG)`);
  }

  const approved = issues.length === 0;

  if (approved) {
    await memory.writeback(name, {
      approval: { approved: true, note: `Review passed: ${changed.length} file(s) checked`, ts: new Date().toISOString() },
    });
  }

  return {
    agent: name, role, task,
    changed_files:  changed,
    issues,
    untested_files: untested,
    not_indexed:    notIndexed,
    docs_updated:   docsUpdated,
    approved,
    advice: approved
      ? `✅ Review passed. ${changed.length} file(s) checked, no issues found.`
      : `🚫 Review failed: ${issues.length} issue(s).\n${issues.map(i => `  • ${i}`).join('\n')}`,
  };
}

module.exports = { name, role, canApprove, run };
