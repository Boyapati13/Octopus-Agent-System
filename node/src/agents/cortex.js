'use strict';
const { loadSkills } = require('../skills');

/**
 * Cortex — Planner
 * Dynamically determines which agents are needed based on the task,
 * instead of running a static list.
 */
const name = 'Cortex';
const role = 'planner';
const canApprove = true;

const REQUIRED_SKILLS = ['get_run_state', 'writeback'];

function determineAgents(taskStr) {
  const t = taskStr.toLowerCase();
  
  const isDoc = t.includes('doc') || t.includes('readme') || t.includes('comment');
  const isRelease = t.includes('release') || t.includes('deploy') || t.includes('publish');
  const isAudit = t.includes('audit') || t.includes('security') || t.includes('vulnerability');
  const isBrowse = t.includes('browse') || t.includes('navigate') || t.includes('scrape') ||
                   t.includes('website') || t.includes('webpage') || t.includes('http') ||
                   t.includes('url') || t.includes('visit') || t.includes('web research');

  if (isBrowse) {
    return [
      { agent: 'Navigator',   reason: 'Navigate to URL and capture page content' },
      { agent: 'Atlas',       reason: 'Cross-reference findings with indexed memory' },
      { agent: 'FactChecker', reason: 'Grounding gate — verify captured claims' },
      { agent: 'Scribe',      reason: 'Document findings in changelog' },
    ];
  }

  if (isAudit) {
    return [
      { agent: 'Atlas', reason: 'Query memory for architecture' },
      { agent: 'SecurityReviewer', reason: 'Run security scan' },
      { agent: 'Scribe', reason: 'Document audit findings' }
    ];
  }

  if (isDoc) {
    return [
      { agent: 'Atlas', reason: 'Query memory for current docs' },
      { agent: 'Forge', reason: 'Draft documentation edits' },
      { agent: 'Reviewer', reason: 'Review documentation quality' },
      { agent: 'Scribe', reason: 'Update changelog' }
    ];
  }
  
  if (isRelease) {
    return [
      { agent: 'ReleaseKeeper', reason: 'Verify all gates before release' }
    ];
  }
  
  // Default: Full feature/implementation chain
  return [
    { agent: 'Atlas',            reason: 'Query memory before opening files' },
    { agent: 'Architect',        reason: 'Assess boundary impact' },
    { agent: 'Forge',            reason: 'Scope the implementation' },
    { agent: 'FactChecker',      reason: 'Grounding gate — verify claims against memory' },
    { agent: 'Reviewer',         reason: 'Quality gate — must approve' },
    { agent: 'SecurityReviewer', reason: 'Security gate — must approve' },
    { agent: 'Probe',            reason: 'Test coverage gate — must pass' },
    { agent: 'Scribe',           reason: 'Update docs and changelog' },
    { agent: 'ReleaseKeeper',    reason: 'Final release gate' }
  ];
}

async function run(input, memory) {
  const { task } = input;
  const skills = await loadSkills(REQUIRED_SKILLS, memory);
  const runState = await skills.get_run_state() || {};

  const steps = determineAgents(task).map((s, i) => ({
    step: i + 1,
    agent: s.agent,
    reason: s.reason,
    status: 'pending',
  }));

  // Mark steps already approved in run state
  const approvals = (runState.approvals || []).map(a => a.agent.toLowerCase());
  for (const s of steps) {
    if (approvals.includes(s.agent.toLowerCase())) s.status = 'approved';
  }

  const result = {
    agent: name, role, task,
    plan: steps,
    blockers: runState.blockers || [],
    advice: `Cortex planned ${steps.length} steps. FactChecker is included for grounding.`,
  };

  await skills.writeback(name, {
    run_patch: { task, status: 'planned', notes: [`Cortex planned: ${task}`] },
  });

  return result;
}

module.exports = { name, role, canApprove, run };
