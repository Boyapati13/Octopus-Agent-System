'use strict';
/**
 * Cortex — Planner
 * Decomposes a task into ordered steps, assigns agents, tracks approval chain.
 */
const name = 'Cortex';
const role = 'planner';
const canApprove = true;

const AGENT_ORDER = [
  { agent: 'Atlas',           reason: 'Query memory before opening files' },
  { agent: 'Architect',       reason: 'Assess boundary impact' },
  { agent: 'Forge',           reason: 'Scope the implementation' },
  { agent: 'Reviewer',        reason: 'Quality gate — must approve' },
  { agent: 'SecurityReviewer',reason: 'Security gate — must approve' },
  { agent: 'Probe',           reason: 'Test coverage gate — must pass' },
  { agent: 'Scribe',          reason: 'Update docs and changelog' },
  { agent: 'ReleaseKeeper',   reason: 'Final release gate' },
];

async function run(input, memory) {
  const { task, query } = input;
  const ctx = await memory.getContext('cortex', task, query);
  const run = ctx.run_state || {};

  const steps = AGENT_ORDER.map((s, i) => ({
    step: i + 1,
    agent: s.agent,
    reason: s.reason,
    status: 'pending',
  }));

  // Mark steps already approved in run state
  const approvals = (run.approvals || []).map(a => a.agent.toLowerCase());
  for (const s of steps) {
    if (approvals.includes(s.agent.toLowerCase())) s.status = 'approved';
  }

  const result = {
    agent: name, role, task,
    plan: steps,
    blockers: run.blockers || [],
    advice: 'Run Atlas first. Do not open raw files until memory cannot answer.',
  };

  await memory.writeback(name, {
    run_patch: { task, status: 'planned', notes: [`Cortex planned: ${task}`] },
  });

  return result;
}

module.exports = { name, role, canApprove, run };
