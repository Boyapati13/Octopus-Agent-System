#!/usr/bin/env node
'use strict';
/**
 * octopus_push_handler.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Triggered by: GitHub Actions on push/PR  OR  local post-commit git hook.
 *
 * Pipeline:
 *  1. Read commit message + changed files → derive task + intent
 *  2. Run full Cortex → agent chain (Cortex now uses LLM to pick agents,
 *     runner auto-synthesises stubs for any unknown agent names)
 *  3. Browse any URLs found in the commit message via Navigator
 *  4. Detect newly added packages (package.json / requirements.txt)
 *     → MarketScout scans → Toolsmith synthesises → SandboxQA validates
 *  5. Print structured summary; exit 0 on gate failures (non-blocking by default)
 */

const path        = require('path');
const fs          = require('fs');
const { execSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..');

// Load .env for local runs (CI injects env vars directly)
try {
  require(path.join(REPO_ROOT, 'node/node_modules/dotenv'))
    .config({ path: path.join(REPO_ROOT, 'node/.env') });
} catch { /* no dotenv or no .env — fine in CI */ }

// Require Octopus internals via absolute paths so their relative internal
// requires resolve correctly regardless of where this script is called from.
const memory       = require(path.join(REPO_ROOT, 'node/src/memory'));
const { runTask }  = require(path.join(REPO_ROOT, 'node/src/runner'));
const { runAgent } = require(path.join(REPO_ROOT, 'node/src/agents'));

// ── Config ─────────────────────────────────────────────────────────────────
const MAX_BROWSE_URLS    = 3;
const MAX_SKILL_SYNTH    = 3;
const SKILL_TOPICS_LIMIT = 8;

// ── Git helpers ─────────────────────────────────────────────────────────────

function git(cmd) {
  try { return execSync(`git ${cmd}`, { encoding: 'utf8', cwd: REPO_ROOT }).trim(); }
  catch { return ''; }
}

function getCommitMessage() {
  return (
    process.env.GIT_COMMIT_MSG ||
    process.env.GITHUB_EVENT_HEAD_COMMIT_MESSAGE ||
    git('log -1 --pretty=%B') ||
    'general maintenance'
  );
}

function getChangedFiles() {
  if (process.env.GIT_CHANGED_FILES)
    return process.env.GIT_CHANGED_FILES.split('\n').filter(Boolean);
  const raw = git('diff --name-only HEAD~1 HEAD');
  return raw ? raw.split('\n').filter(Boolean) : [];
}

// ── Intent detection ────────────────────────────────────────────────────────

const INTENT_PATTERNS = [
  [/(feat|add|new|implement)/i,            'feature-implementation'],
  [/(fix|bug|patch|hotfix|resolve)/i,      'bug-fix'],
  [/(sec|audit|vuln|owasp|cve)/i,         'security-audit'],
  [/(doc|readme|comment|jsdoc)/i,          'documentation-update'],
  [/(release|deploy|publish|version)/i,    'release-preparation'],
  [/(skill|tool|market|synthesize)/i,      'skill-marketplace-update'],
  [/(browse|navigate|scrape|https?:)/i,    'web-research'],
  [/(refactor|clean|lint|format)/i,        'code-quality'],
  [/(test|spec|coverage|jest|pytest)/i,    'test-improvement'],
  [/(perf|optim|speed|memory|cache)/i,     'performance-optimization'],
];

function detectIntent(msg) {
  for (const [re, intent] of INTENT_PATTERNS) {
    if (re.test(msg)) return intent;
  }
  return 'general-maintenance';
}

function buildTask(commitMsg, changedFiles) {
  const intent  = detectIntent(commitMsg);
  const fileStr = changedFiles.length
    ? `Changed: ${changedFiles.slice(0, 6).join(', ')}`
    : '';
  return [commitMsg.split('\n')[0], fileStr, `Intent: ${intent}`].filter(Boolean).join(' | ');
}

// ── URL + package extraction ────────────────────────────────────────────────

function extractUrls(text) {
  return [...new Set((text.match(/https?:\/\/\S+/g) || []))];
}

function readJson(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch { return {}; }
}

// Packages that are too common to synthesise skills for
const SKIP_PACKAGES = new Set([
  'axios','express','dotenv','jest','supertest','cors','body-parser',
  'fs','path','os','crypto','util','http','https','events','stream',
  'flask','requests','pytest','numpy','sqlalchemy','werkzeug',
]);

function extractNewPackages(changedFiles) {
  const topics = new Set();

  if (changedFiles.includes('node/package.json')) {
    const pkg = readJson(path.join(REPO_ROOT, 'node/package.json'));
    Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })
      .forEach(d => topics.add(d));
  }

  for (const f of changedFiles) {
    if (f.endsWith('requirements.txt')) {
      try {
        fs.readFileSync(path.join(REPO_ROOT, f), 'utf8')
          .split('\n')
          .map(l => l.split(/[>=<!;\s]/)[0].trim())
          .filter(Boolean)
          .forEach(p => topics.add(p));
      } catch {}
    }
  }

  return [...topics]
    .filter(t => !SKIP_PACKAGES.has(t.replace(/^@[^/]+\//, '')))
    .slice(0, SKILL_TOPICS_LIMIT);
}

// ── Skill synthesis ─────────────────────────────────────────────────────────

async function synthesiseSkills(packages) {
  const results = [];

  for (const pkg of packages.slice(0, MAX_SKILL_SYNTH)) {
    const isNode  = pkg.startsWith('@') || /^[a-z]/.test(pkg);
    const docUrl  = isNode
      ? `https://www.npmjs.com/package/${pkg}`
      : `https://pypi.org/project/${pkg}/`;
    const skillName = pkg.replace(/[@/]/g, '_').replace(/[^a-z0-9_]/gi, '_');

    console.log(`[octopus] Synthesising skill for "${pkg}" → ${docUrl}`);

    try {
      const synth = await runAgent('toolsmith', {
        name: skillName, doc_url: docUrl,
        description: `MCP tool to interact with the ${pkg} library`,
      }, memory);

      if (!synth.skill_id) { console.warn(`[octopus] No skill_id for ${pkg}`); continue; }

      const qa = await runAgent('sandboxqa', { skill_id: synth.skill_id }, memory);

      results.push({ pkg, skill_id: synth.skill_id, qa_passed: qa.approved, attempts: qa.attempts });

      console.log(qa.approved
        ? `[octopus] ✅ "${skillName}" passed QA (${qa.attempts} attempt(s))`
        : `[octopus] ⚠️  "${skillName}" failed QA: ${qa.error}`
      );
    } catch (err) {
      console.warn(`[octopus] Skill synthesis error for ${pkg}: ${err.message}`);
    }
  }

  return results;
}

// ── Summary ─────────────────────────────────────────────────────────────────

function printSummary({ task, intent, chainResult, browsed, skills }) {
  const hr = '─'.repeat(64);
  console.log(`\n${hr}`);
  console.log('  🐙  OCTOPUS PIPELINE SUMMARY');
  console.log(hr);
  console.log(`  Task   : ${task}`);
  console.log(`  Intent : ${intent}`);

  if (chainResult) {
    const spawned = chainResult.agents_spawned || [];
    console.log(`  Agents : ${spawned.join(' → ') || 'none'}`);
    if (chainResult.errors?.length)
      console.log(`  Errors : ${chainResult.errors.map(e => e.agent).join(', ')}`);
  }

  if (browsed.length) console.log(`  Browsed: ${browsed.join(', ')}`);

  if (skills.length) {
    const passed = skills.filter(s => s.qa_passed).map(s => s.pkg);
    const failed = skills.filter(s => !s.qa_passed).map(s => s.pkg);
    if (passed.length) console.log(`  Skills+: ${passed.join(', ')}`);
    if (failed.length) console.log(`  Skills✗: ${failed.join(', ')}`);
  }

  console.log(`${hr}\n`);
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const commitMsg    = getCommitMessage();
  const changedFiles = getChangedFiles();
  const intent       = detectIntent(commitMsg);
  const task         = buildTask(commitMsg, changedFiles);
  const urls         = extractUrls(commitMsg);
  const newPackages  = extractNewPackages(changedFiles);

  console.log('[octopus] Push pipeline starting');
  console.log(`[octopus] Commit  : ${commitMsg.split('\n')[0]}`);
  console.log(`[octopus] Intent  : ${intent}`);
  console.log(`[octopus] Changed : ${changedFiles.length} file(s)`);
  console.log(`[octopus] URLs    : ${urls.length} | Packages: ${newPackages.length}`);

  // 1. Run the Cortex → agent chain
  //    Cortex uses LLM to select agents; runner auto-creates unknown ones
  let chainResult = null;
  try {
    chainResult = await runTask(task, memory);
    console.log(`[octopus] Chain spawned: ${(chainResult.agents_spawned || []).join(', ')}`);
  } catch (err) {
    console.warn(`[octopus] Chain stopped: ${err.message}`);
  }

  // 2. Browse URLs mentioned in commit message
  const browsed = [];
  for (const url of urls.slice(0, MAX_BROWSE_URLS)) {
    try {
      console.log(`[octopus] Browsing: ${url}`);
      await runAgent('navigator', { url, task: `Read: ${url}` }, memory);
      browsed.push(url);
    } catch (err) {
      console.warn(`[octopus] Browse failed (${url}): ${err.message}`);
    }
  }

  // 3. Skill synthesis for new packages
  let skills = [];
  if (newPackages.length) {
    try { await runAgent('marketscout', { topics: newPackages }, memory); } catch {}
    skills = await synthesiseSkills(newPackages);
  }

  printSummary({ task, intent, chainResult, browsed, skills });
  console.log('[octopus] ✅ Pipeline complete');
}

main().catch(err => {
  console.error('[octopus] Fatal:', err.message);
  process.exit(1);
});
