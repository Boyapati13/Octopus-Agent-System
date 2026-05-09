const { getMemory, findRelevantFiles } = require('./memory');

function onboard(dataDir) {
  const memory = getMemory(dataDir);
  return {
    command: '/onboard',
    indexedFiles: memory.structural.length,
    sample: memory.structural.slice(0, 5).map(x => x.path),
    advice: 'Memory created. Query Atlas first before opening files.'
  };
}

function planFeature(dataDir, query) {
  const memory = getMemory(dataDir);
  const files = findRelevantFiles(memory.structural, query);
  return {
    command: '/plan-feature',
    query,
    relevantFiles: files,
    plan: [
      'Use Atlas to inspect relevant files only',
      'Ask Architect for boundary impact',
      'Define tests before edits',
      'Use Forge for scoped implementation',
      'Run Reviewer, SecurityReviewer, and Probe',
      'Update memory and docs'
    ]
  };
}

function releaseCheck(dataDir) {
  const memory = getMemory(dataDir);
  return {
    command: '/release-check',
    runState: memory.run,
    gates: [
      'Reviewer approved',
      'SecurityReviewer approved',
      'Probe passed',
      'Rollback documented'
    ]
  };
}

module.exports = { onboard, planFeature, releaseCheck };
