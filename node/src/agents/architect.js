'use strict';
/**
 * Architect — Architecture
 * Identifies which modules a change touches; flags cross-boundary risks.
 */
const name = 'Architect';
const role = 'architecture';
const canApprove = false;

const BOUNDARY_RISK_THRESHOLD = 3;

async function run(input, memory) {
  const { task, query, files = [] } = input;
  const ctx = await memory.getContext('architect', task, query);
  const relevantFiles = files.length > 0 ? files : (ctx?.relevant_files || []).map(f => f.path);
  const impact = ctx?.boundary_impact || [];

  const riskScore = impact.length;
  const riskLevel = riskScore >= BOUNDARY_RISK_THRESHOLD ? 'high'
    : riskScore > 0 ? 'medium' : 'low';

  const crossBoundary = impact.filter(p =>
    relevantFiles.some(rf => !p.startsWith(rf.split('/')[0]))
  );

  return {
    agent: name, role, task,
    affected_files: relevantFiles,
    boundary_impact: impact,
    cross_boundary_risks: crossBoundary,
    risk_level: riskLevel,
    advice: riskLevel === 'high'
      ? `High boundary impact (${impact.length} files). Review cross-boundary changes with Reviewer before proceeding.`
      : riskLevel === 'medium'
      ? `Medium impact. Verify ${impact.length} downstream file(s) still work after change.`
      : 'Low impact. Change appears self-contained.',
  };
}

module.exports = { name, role, canApprove, run };
