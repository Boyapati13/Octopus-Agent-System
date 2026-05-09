'use strict';
/**
 * Probe — Testing
 * Maps changed files → test files via symbol matching.
 * Reports untested symbols and estimated coverage.
 */
const name = 'Probe';
const role = 'testing';
const canApprove = true;

async function run(input, memory) {
  const { task } = input;
  const ctx = await memory.getContext('probe', task);
  const run = ctx?.run_state || {};
  const changed = run.changed_files || [];
  const allFiles = ctx?.relevant_files || [];

  const testFiles = allFiles.filter(f => f.path.includes('test'));
  const sourceFiles = allFiles.filter(f => !f.path.includes('test'));

  const coverage = [];
  for (const sf of sourceFiles.filter(f => changed.includes(f.path))) {
    const symbols = sf.symbols || [];
    const tested = symbols.filter(sym =>
      testFiles.some(tf => (tf.symbols || []).some(ts => ts.toLowerCase().includes(sym.toLowerCase())))
    );
    coverage.push({
      file: sf.path,
      symbols_total: symbols.length,
      symbols_tested: tested.length,
      coverage_pct: symbols.length > 0 ? Math.round(tested.length / symbols.length * 100) : 0,
      untested: symbols.filter(s => !tested.includes(s)),
    });
  }

  const avgCoverage = coverage.length > 0
    ? Math.round(coverage.reduce((s, c) => s + c.coverage_pct, 0) / coverage.length)
    : 100;

  const approved = avgCoverage >= 70 || changed.length === 0;

  if (approved) {
    await memory.writeback(name, {
      approval: { approved: true, note: `Probe: ${avgCoverage}% avg coverage`, ts: new Date().toISOString() },
    });
  }

  return {
    agent: name, role, task,
    changed_files: changed,
    coverage,
    avg_coverage_pct: avgCoverage,
    test_files_found: testFiles.length,
    approved,
    advice: approved
      ? `Coverage ${avgCoverage}%. Probe passed.`
      : `Coverage ${avgCoverage}% is below 70% threshold. Add tests before release.`,
  };
}

module.exports = { name, role, canApprove, run };
