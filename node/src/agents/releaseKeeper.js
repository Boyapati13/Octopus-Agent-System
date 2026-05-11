'use strict';
/**
 * ReleaseKeeper — Final Release Gate
 * Verifies every required gate has approved before release.
 * Checks rollback documentation and run status.
 * GATE: blocks release if any gate is missing or rejected.
 */
const name = 'ReleaseKeeper';
const role = 'release';
const canApprove = true;

const REQUIRED_GATES = ['Reviewer', 'SecurityReviewer', 'Probe', 'FactChecker'];

async function run(input, memory) {
  const { task } = input;

  const ctx       = await memory.getContext('release-keeper', task, task);
  const runState  = ctx?.run_state || await memory.getRun() || {};
  const approvals = runState.approvals || [];
  const decisions = ctx?.recent_decisions || [];

  // Gate status
  const gates = REQUIRED_GATES.map(gate => {
    const found = approvals.find(a => a.agent?.toLowerCase() === gate.toLowerCase());
    return {
      gate,
      approved: found?.approved === true,
      note:     found?.note  || 'Not yet approved',
      ts:       found?.ts    || null,
    };
  });

  // Rollback check
  const hasRollback = decisions.some(d =>
    (d.tags || []).includes('rollback') ||
    (d.rationale || '').toLowerCase().includes('rollback')
  );
  gates.push({
    gate:     'RollbackDocumented',
    approved: hasRollback,
    note:     hasRollback ? 'Rollback plan recorded in decisions' : 'No rollback plan in decisions',
  });

  // Clean run state check
  const runStatus  = runState.status || 'unknown';
  const runClean   = !['error', 'failed', 'blocked'].includes(runStatus);
  gates.push({
    gate:     'RunStateClean',
    approved: runClean,
    note:     runClean ? `Run status: ${runStatus}` : `Run status is "${runStatus}" — resolve before release`,
  });

  const blockers   = gates.filter(g => !g.approved);
  const allPassed  = blockers.length === 0;

  if (allPassed) {
    await memory.writeback(name, {
      approval: { approved: true, note: 'All release gates passed', ts: new Date().toISOString() },
      run_patch: { status: 'released', notes: [`Released: ${task}`] },
    });
  }

  return {
    agent: name, role, task,
    gates,
    gates_passed:     gates.filter(g => g.approved).length,
    gates_total:      gates.length,
    blockers:         blockers.map(g => g.gate),
    all_gates_passed: allPassed,
    run_status:       runStatus,
    advice: allPassed
      ? `✅ All ${gates.length} gates passed. Release approved.`
      : `🚫 Blocked by: [${blockers.map(g => g.gate).join(', ')}]. Resolve gate failures before release.`,
  };
}

module.exports = { name, role, canApprove, run };
