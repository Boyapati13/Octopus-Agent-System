'use strict';
/**
 * Probe — Test Coverage Gate
 * Discovers test files and maps them to source symbols.
 * Blocks release if average coverage falls below threshold.
 * GATE: sets approved=false to stop the chain.
 */
const name = 'Probe';
const role = 'testing';
const canApprove = true;

const COVERAGE_THRESHOLD = 70; // percent

function matchTests(sourceFile, testFiles) {
  const baseName = sourceFile.split('/').pop().replace(/\.\w+$/, '').toLowerCase();
  return testFiles.filter(tf =>
    tf.path.toLowerCase().includes(baseName) ||
    (tf.symbols || []).some(s => s.toLowerCase().includes(baseName))
  );
}

async function run(input, memory) {
  const { task } = input;

  const ctx      = await memory.getContext('probe', task, task);
  const runState = ctx?.run_state || await memory.getRun() || {};
  const changed  = runState.changed_files || [];
  const allFiles = ctx?.relevant_files   || [];

  const testFiles   = allFiles.filter(f => /test|spec/i.test(f.path));
  const sourceFiles = allFiles.filter(f => !/test|spec/i.test(f.path) && /\.(js|ts|py)$/.test(f.path));

  const coverage = changed
    .filter(f => !/test|spec|\.md|\.json/i.test(f))
    .map(changedPath => {
      const sf = sourceFiles.find(s => s.path === changedPath);
      if (!sf) return { file: changedPath, coverage_pct: 0, status: 'not-indexed', tests: [] };

      const symbols     = sf.symbols || [];
      const matchedTests = matchTests(changedPath, testFiles);
      const testedSyms  = symbols.filter(sym =>
        matchedTests.some(tf => (tf.symbols || []).some(ts => ts.toLowerCase().includes(sym.toLowerCase())))
      );

      const pct = symbols.length > 0
        ? Math.round(testedSyms.length / symbols.length * 100)
        : (matchedTests.length > 0 ? 80 : 0);

      return {
        file: changedPath,
        symbols_total:  symbols.length,
        symbols_tested: testedSyms.length,
        coverage_pct:   pct,
        tests: matchedTests.map(t => t.path),
        status: pct >= COVERAGE_THRESHOLD ? 'passing' : 'below-threshold',
      };
    });

  const avgCoverage = coverage.length > 0
    ? Math.round(coverage.reduce((s, c) => s + c.coverage_pct, 0) / coverage.length)
    : 100;

  const approved = avgCoverage >= COVERAGE_THRESHOLD || changed.length === 0;

  if (approved) {
    await memory.writeback(name, {
      approval: { approved: true, note: `Probe: ${avgCoverage}% avg coverage (threshold ${COVERAGE_THRESHOLD}%)`, ts: new Date().toISOString() },
    });
  }

  return {
    agent: name, role, task,
    changed_files:     changed,
    coverage,
    avg_coverage_pct:  avgCoverage,
    threshold_pct:     COVERAGE_THRESHOLD,
    test_files_found:  testFiles.length,
    below_threshold:   coverage.filter(c => c.coverage_pct < COVERAGE_THRESHOLD).map(c => c.file),
    approved,
    advice: approved
      ? `✅ Coverage ${avgCoverage}% meets ${COVERAGE_THRESHOLD}% threshold.`
      : `🚫 Coverage ${avgCoverage}% below ${COVERAGE_THRESHOLD}% threshold. Add tests for: ${coverage.filter(c => c.coverage_pct < COVERAGE_THRESHOLD).map(c => c.file).join(', ')}`,
  };
}

module.exports = { name, role, canApprove, run };
