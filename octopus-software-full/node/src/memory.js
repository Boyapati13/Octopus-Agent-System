const fs = require('fs');
const path = require('path');

function loadJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function getMemory(dataDir) {
  return {
    structural: loadJson(path.join(dataDir, 'structural_memory.json'), []),
    decisions: loadJson(path.join(dataDir, 'decision_memory.json'), []),
    run: loadJson(path.join(dataDir, 'run_memory.json'), { task: '', status: 'idle', changed_files: [], notes: [] })
  };
}

function findRelevantFiles(structural, query) {
  const q = query.toLowerCase();
  return structural.filter(entry => {
    return entry.path.toLowerCase().includes(q)
      || (entry.summary || '').toLowerCase().includes(q)
      || (entry.symbols || []).some(symbol => symbol.toLowerCase().includes(q));
  }).slice(0, 10);
}

module.exports = { getMemory, findRelevantFiles };
