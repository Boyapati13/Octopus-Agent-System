'use strict';
/**
 * ReleaseKeeper — Release
 * Validates all gates before a release can proceed.
 * Only needs approvals and run state — never source code.
 */
const name = 'ReleaseKeeper';
const role = 'release';
const canApprove = true;

const REQUIRED_GATES = ['Reviewer', 'SecurityReviewer', 'Probe'];

async function run(input, memory) {
  const { task } = input;
  const ctx = await memory.getContext('release-keeper', task);
  const run = ctx?.run_state || await memory.getRun() || {};
  const approvals = run.approvals || [];

  const gates = REQUIRED_GATES.map(agent => {
    const found = approvals.find(a => a.agent.toLowerCase() === agent.toLowerCase());
    return {
      gate: agent,
      approved: found?.approved === true,
      note: found?.note || 'Not yet approved',
      ts: found?.ts || null,
    };
  });

  // Check rollback documentation
  const decisions = ctx?.recent_decisions || [];
  const hasRollback = decisions.some(d =>
    (d.tags || []).includes('rollback') || (d.rationale || '').toLowerCase().includes('rollback')
  );
  gates.push({
    gate: 'RollbackDocumented',
    approved: hasRollback,
    note: hasRollback ? 'Rollback plan found in decisions' : 'No rollback decision recorded',
  });

  const allPassed = gates.every(g => g.approved);

  if (allPassed) {
    await memory.writeback(name, {
      approval: { approved: true, note: 'All gates passed. Release approved.', ts: new Date().toISOString() },
      run_patch: { status: 'released' },
    });
  }

  return {
    agent: name, role, task,
    gates,
    all_gates_passed: allPassed,
    blockers: gates.filter(g => !g.approved).map(g => g.gate),
    advice: allPassed
      ? '✅ All gates passed. Release is approved.'
      : `🚫 Blocked: [${gates.filter(g => !g.approved).map(g => g.gate).join(', ')}] must approve first.`,
  };
}

module.exports = { name, role, canApprove, run };
