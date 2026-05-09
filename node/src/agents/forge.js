'use strict';
const { loadSkills } = require('../skills');

/**
 * Forge — Implementation
 * Builds scoped edit plans from query + memory context.
 * References relevant decisions to avoid repeating past mistakes.
 */
const name = 'Forge';
const role = 'implementation';
const canApprove = false;

const REQUIRED_SKILLS = ['structural_search', 'get_decisions', 'update_run'];

async function run(input, memory) {
  const { task, query, files = [] } = input;
  const skills = await loadSkills(REQUIRED_SKILLS, memory);
  
  // 1. Search structural memory directly using the skill
  const memFiles = await skills.structural_search(query || task);
  
  const relevantFiles = files.length > 0
    ? files
    : (memFiles || []).map(f => f.path).slice(0, 5);
    
  // 2. Load recent decisions
  const decisions = await skills.get_decisions();

  const editPlan = relevantFiles.map(f => ({
    file: f,
    action: 'modify',
    rationale: `Required by task: "${task}"`,
    test_required: !f.includes('test'),
  }));

  const cautions = (decisions || [])
    .filter(d => d.risk === 'high')
    .map(d => `⚠️ Past decision "${d.title}" flagged risk: ${d.rationale}`);
    
  // 3. Update the run state
  await skills.update_run({ 
    changed_files: editPlan.map(e => e.file), 
    status: 'in-progress',
    notes: [`Forge planned edits for ${editPlan.length} files.`]
  });

  return {
    agent: name, role, task,
    edit_plan: editPlan,
    file_count: editPlan.length,
    past_decisions_referenced: (decisions || []).length,
    cautions,
    advice: 'Implement only files in edit_plan. FactChecker will verify these against memory.',
  };
}

module.exports = { name, role, canApprove, run };
