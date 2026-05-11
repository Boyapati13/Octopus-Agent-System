'use strict';
/**
 * Architect — Boundary Impact Assessment
 * Maps a proposed change to every module it touches.
 * Flags cross-boundary risks and circular-dependency exposure.
 * Output feeds Forge's edit plan and FactChecker's claim list.
 */
const name = 'Architect';
const role = 'architecture';
const canApprove = false;

const RISK = { high: 3, medium: 2, low: 1 };

function riskLevel(impactCount) {
  if (impactCount >= 5) return 'high';
  if (impactCount >= 2) return 'medium';
  return 'low';
}

function detectCircularRisk(files) {
  // Simple heuristic: files that import from each other across module boundaries
  const modules = files.reduce((acc, f) => {
    const mod = (f.path || '').split('/').slice(0, 2).join('/');
    acc[mod] = (acc[mod] || []).concat(f.path);
    return acc;
  }, {});
  return Object.keys(modules).filter(m => modules[m].length > 3);
}

async function run(input, memory) {
  const { task, query, files = [] } = input;

  const ctx    = await memory.getContext('architect', task, query || task);
  const impact = ctx?.boundary_impact || [];
  const allFiles = files.length > 0 ? files : (ctx?.relevant_files || []).map(f => f.path);

  const level        = riskLevel(impact.length);
  const crossBoundary = impact.filter(p =>
    allFiles.some(rf => rf && p && rf.split('/')[0] !== p.split('/')[0])
  );
  const circularRisk = detectCircularRisk(ctx?.relevant_files || []);

  const recommendations = [];
  if (level === 'high')      recommendations.push('Request SecurityReviewer deep scan before merge.');
  if (crossBoundary.length)  recommendations.push(`Review ${crossBoundary.length} cross-boundary dependency(ies).`);
  if (circularRisk.length)   recommendations.push(`Possible circular deps in: ${circularRisk.join(', ')}`);
  if (!recommendations.length) recommendations.push('Change appears self-contained — low architectural risk.');

  await memory.writeback(name, {
    run_patch: {
      task, status: 'architecture-assessed',
      notes: [`Architect: risk=${level}, impact=${impact.length} file(s)`],
    },
  });

  return {
    agent: name, role, task,
    affected_files: allFiles,
    boundary_impact: impact,
    cross_boundary_risks: crossBoundary,
    circular_risk_modules: circularRisk,
    risk_level: level,
    risk_score: impact.length,
    recommendations,
    advice: recommendations.join(' '),
  };
}

module.exports = { name, role, canApprove, run };
