'use strict';
/**
 * Forge — Implementation
 * Builds scoped edit plans from query + memory context.
 * References relevant decisions to avoid repeating past mistakes.
 */
const name = 'Forge';
const role = 'implementation';
const canApprove = false;

async function run(input, memory) {
  const { task, query, files = [] } = input;
  const ctx = await memory.getContext('forge', task, query);
  const relevantFiles = files.length > 0
    ? files
    : (ctx?.relevant_files || []).map(f => f.path).slice(0, 5);
  const decisions = ctx?.recent_decisions || [];

  const editPlan = relevantFiles.map(f => ({
    file: f,
    action: 'modify',
    rationale: `Required by task: "${task}"`,
    test_required: !f.includes('test'),
  }));

  const cautions = decisions
    .filter(d => d.risk === 'high')
    .map(d => `⚠️ Past decision "${d.title}" flagged risk: ${d.rationale}`);

  return {
    agent: name, role, task,
    edit_plan: editPlan,
    file_count: editPlan.length,
    past_decisions_referenced: decisions.length,
    cautions,
    advice: 'Implement only files in edit_plan. Update run state after each file. Run Reviewer when done.',
  };
}

module.exports = { name, role, canApprove, run };
