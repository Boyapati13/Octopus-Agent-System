'use strict';
/**
 * Reviewer — Code Review
 * Checks changed files against structural index; flags missing test coverage.
 */
const name = 'Reviewer';
const role = 'review';
const canApprove = true;

async function run(input, memory) {
  const { task } = input;
  const ctx = await memory.getContext('reviewer', task);
  const run = ctx?.run_state || {};
  const changed = run.changed_files || [];
  const allFiles = ctx?.relevant_files || [];

  const issues = [];
  const untested = [];

  for (const f of changed) {
    const indexed = allFiles.find(af => af.path === f);
    if (!indexed) issues.push(`${f}: not in structural index — run /onboard after edits`);
    const hasTest = allFiles.some(af =>
      af.path.includes('test') && (af.symbols || []).some(s => s.toLowerCase().includes('test'))
    );
    if (!hasTest) untested.push(f);
  }

  const approved = issues.length === 0 && untested.length === 0;

  if (approved) {
    await memory.writeback(name, {
      approval: { approved: true, note: 'Review passed', ts: new Date().toISOString() },
    });
  }

  return {
    agent: name, role, task,
    changed_files: changed,
    issues,
    untested_files: untested,
    approved,
    advice: approved
      ? 'Review passed. Proceed to SecurityReviewer.'
      : `Review failed: ${issues.length} issue(s), ${untested.length} file(s) missing tests.`,
  };
}

module.exports = { name, role, canApprove, run };
