'use strict';
/**
 * Forge — Implementation Planner
 * Builds a precise, file-level edit plan from memory context and past decisions.
 * Never writes code directly — produces a structured plan for the human or a
 * downstream code-generation step to execute.
 */
const { loadSkills } = require('../skills');

const name = 'Forge';
const role = 'implementation';
const canApprove = false;

const REQUIRED_SKILLS = ['structural_search', 'get_decisions', 'update_run'];

const ACTION_MAP = {
  add:      ['new feature', 'add', 'create', 'implement', 'introduce'],
  modify:   ['fix', 'update', 'change', 'refactor', 'improve', 'enhance'],
  delete:   ['remove', 'delete', 'drop', 'deprecate'],
  test:     ['test', 'spec', 'coverage'],
};

function inferAction(task, file) {
  const t = task.toLowerCase();
  for (const [action, keywords] of Object.entries(ACTION_MAP)) {
    if (keywords.some(k => t.includes(k))) return action;
  }
  return file.includes('test') ? 'test' : 'modify';
}

async function run(input, memory) {
  const { task, query, files = [] } = input;
  const skills = await loadSkills(REQUIRED_SKILLS, memory);

  const memFiles  = await skills.structural_search(query || task) || [];
  const decisions = await skills.get_decisions() || [];

  const relevant = files.length > 0
    ? files
    : memFiles.map(f => f.path).slice(0, 6);

  const editPlan = relevant.map(f => ({
    file:          f,
    action:        inferAction(task, f),
    rationale:     `Required by: "${task}"`,
    test_required: !f.includes('test') && !f.includes('.json') && !f.includes('.md'),
    estimated_lines: f.includes('test') ? '20-50' : '30-100',
  }));

  const highRiskDecisions = decisions.filter(d => d.risk === 'high');
  const cautions = highRiskDecisions.map(d =>
    `⚠️  Past decision "${d.title}" flagged HIGH risk: ${d.rationale}`
  );

  const testsNeeded = editPlan.filter(e => e.test_required).map(e => e.file);

  await skills.update_run({
    changed_files: editPlan.map(e => e.file),
    status: 'implementation-planned',
    notes: [`Forge: planned ${editPlan.length} edit(s) for task "${task}"`],
  });

  return {
    agent: name, role, task,
    edit_plan: editPlan,
    file_count: editPlan.length,
    tests_needed: testsNeeded,
    past_decisions_referenced: decisions.length,
    high_risk_decisions: highRiskDecisions.length,
    cautions,
    advice: cautions.length
      ? `Proceed carefully — ${cautions.length} high-risk past decision(s) apply. ${cautions[0]}`
      : `Plan ready: ${editPlan.length} file(s) to edit. Tests required for: ${testsNeeded.join(', ') || 'none'}.`,
  };
}

module.exports = { name, role, canApprove, run };
