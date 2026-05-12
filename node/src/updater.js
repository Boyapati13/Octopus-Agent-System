'use strict';
/**
 * updater.js — Self-Update Engine
 *
 * Checks GitHub for new commits, applies git pull + npm install,
 * and optionally re-pulls Ollama models that have been updated.
 */
const { execSync, spawnSync } = require('child_process');
const path  = require('path');
const fs    = require('fs');
const axios = require('axios');

const REPO_ROOT  = path.resolve(__dirname, '..', '..');
const NODE_DIR   = path.join(REPO_ROOT, 'node');
const REPO_API   = 'https://api.github.com/repos/Boyapati13/Octopus-Agent-System/commits/master';
const OLLAMA_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';

function currentCommit() {
  try {
    return execSync('git rev-parse HEAD', { cwd: REPO_ROOT, encoding: 'utf8', timeout: 5000 }).trim().slice(0, 7);
  } catch { return 'unknown'; }
}

function currentVersion() {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(NODE_DIR, 'package.json'), 'utf8'));
    return pkg.version || '0.0.0';
  } catch { return '0.0.0'; }
}

async function checkForUpdate() {
  const local = currentCommit();
  try {
    const res = await axios.get(REPO_API, { timeout: 6000, headers: { 'User-Agent': 'octopus-updater' } });
    const remote = (res.data.sha || '').slice(0, 7);
    const message = (res.data.commit?.message || '').split('\n')[0];
    return { local, remote, hasUpdate: local !== remote && local !== 'unknown', message };
  } catch (err) {
    return { local, remote: null, hasUpdate: false, error: err.message };
  }
}

async function applyUpdate(onProgress) {
  const log = onProgress || (() => {});
  try {
    log('  Pulling latest from GitHub...');
    execSync('git pull origin master --quiet', { cwd: REPO_ROOT, timeout: 60000 });
    log('  Installing Node.js dependencies...');
    execSync('npm install --silent', { cwd: NODE_DIR, timeout: 120000 });
    log('  Regenerating adapters...');
    spawnSync('node', ['src/cross-link.js'], { cwd: NODE_DIR, timeout: 15000 });
    log('  Done — restart Octopus to use the new version.');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

async function listOllamaModels() {
  try {
    const res = await axios.get(`${OLLAMA_URL}/api/tags`, { timeout: 5000 });
    return (res.data?.models || []).map(m => m.name);
  } catch { return []; }
}

async function updateOllamaModels(models, onProgress) {
  const log = onProgress || (() => {});
  const results = [];
  for (const model of models) {
    log(`  Pulling ${model}...`);
    const r = spawnSync('ollama', ['pull', model], { timeout: 300000, encoding: 'utf8' });
    results.push({ model, ok: r.status === 0, output: (r.stdout || r.stderr || '').trim().split('\n').pop() });
  }
  return results;
}

async function checkModelUpdates() {
  const installed = await listOllamaModels();
  return {
    installed,
    count: installed.length,
    hint: installed.length
      ? `Run /update-models to re-pull all ${installed.length} model(s) and check for newer versions.`
      : 'No Ollama models installed. Run: ollama pull gemma4:e2b',
  };
}

module.exports = { checkForUpdate, applyUpdate, currentCommit, currentVersion, listOllamaModels, updateOllamaModels, checkModelUpdates };
