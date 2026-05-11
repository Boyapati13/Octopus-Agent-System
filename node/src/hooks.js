'use strict';
/**
 * Deterministic Hook System — Pre/PostToolUse + Stop
 *
 * These hooks are NOT AI. They run synchronously or in O(1) time.
 * Think git hooks for your agent: instant, token-free, always-on.
 *
 * PreToolUse  — blocks known-fatal commands before any code runs
 * PostToolUse — auto-formats written files (eslint/prettier)
 * onStop      — fires a completion notification at end of task chain
 */
const { execSync } = require('child_process');
const path   = require('path');
const https  = require('https');
const http   = require('http');
const { KINDS, OctopusError } = require('./errors');

// ── Fatal patterns — blocked instantly, zero AI tokens spent ─────────────────

const FATAL_COMMAND_PATTERNS = [
  /rm\s+-[rRfF]{1,2}\s+\/\s*$/,          // rm -rf /
  /rm\s+-[rRfF]{1,2}\s+\/\*/,            // rm -rf /*
  /rm\s+-[rRfF]{1,2}\s+~\s*$/,           // rm -rf ~  (home)
  /mkfs\b/i,                               // format block device
  /:\s*\(\s*\)\s*\{.*:\|:.*\}/,          // fork bomb
  /dd\s+.*\bof=\/dev\/[sh]d[a-z]/i,      // dd to raw disk
  />\s*\/dev\/[sh]d[a-z]\b/,             // redirect to raw disk
  /chmod\s+-R\s+777\s+\//i,              // chmod 777 / recursive
];

const FATAL_SQL_PATTERNS = [
  /\bDROP\s+DATABASE\b/i,
  /\bDROP\s+SCHEMA\b/i,
  /\bDROP\s+TABLE\b(?!\s+IF\s+EXISTS\s+\w*_test\b)/i,  // allow _test tables
  /\bTRUNCATE\s+TABLE\b(?!\s+\w*_test\b)/i,
  /\bDELETE\s+FROM\s+\w+\s*(?:;|$)/i,    // DELETE with no WHERE clause
];

// ── PreToolUse — synchronous, called before any tool logic ───────────────────

function preToolUse(toolName, args) {
  if (toolName !== 'octopus_execute_command') return;

  const cmd = (args.command || '').trim();

  for (const pattern of FATAL_COMMAND_PATTERNS) {
    if (pattern.test(cmd)) {
      throw new OctopusError(
        KINDS.PERMISSION_DENIED,
        `PreToolUse hook: fatal command blocked — "${cmd}"`,
        'hooks',
        { hook: 'PreToolUse', pattern: pattern.toString(), command: cmd }
      );
    }
  }

  for (const pattern of FATAL_SQL_PATTERNS) {
    if (pattern.test(cmd)) {
      throw new OctopusError(
        KINDS.PERMISSION_DENIED,
        `PreToolUse hook: dangerous SQL blocked — "${cmd}"`,
        'hooks',
        { hook: 'PreToolUse', pattern: pattern.toString(), command: cmd }
      );
    }
  }
}

// ── PostToolUse — async, fires after octopus_write_file succeeds ──────────────

async function postToolUse(toolName, args) {
  if (toolName !== 'octopus_write_file') return;

  const filePath = args.path || '';
  const ext = path.extname(filePath).toLowerCase();
  const JS_EXTS = new Set(['.js', '.ts', '.jsx', '.tsx', '.mjs', '.cjs']);

  if (!JS_EXTS.has(ext)) return;

  const opts = { timeout: 15000, stdio: 'ignore', windowsHide: true };

  try {
    try {
      execSync(`npx prettier --write "${filePath}"`, opts);
      console.error(`[hooks:post] prettier formatted ${filePath}`);
    } catch {
      execSync(`npx eslint --fix "${filePath}"`, opts);
      console.error(`[hooks:post] eslint --fix applied to ${filePath}`);
    }
  } catch (e) {
    // Non-fatal: formatter missing or file has parse errors — log and continue
    console.warn(`[hooks:post] auto-format skipped for ${filePath}: ${e.message}`);
  }
}

// ── onStop — fires at end of runTask(), notifies external watchers ────────────

function onStop(task, results) {
  const agentCount = Object.keys(results.results || {}).length;
  const errorCount = (results.errors || []).length;
  const status     = errorCount > 0 ? 'partial' : 'ok';
  const summary    = `[Octopus] Task "${task}" complete — ${agentCount} agents, ${errorCount} errors (${status})`;

  console.error(`[hooks:stop] ${summary}`);

  const webhookUrl = process.env.OCTOPUS_WEBHOOK_URL;
  if (!webhookUrl) return;

  try {
    const payload = Buffer.from(JSON.stringify({
      text: summary, task, agents: agentCount, errors: errorCount, status,
    }));
    const url  = new URL(webhookUrl);
    const mod  = url.protocol === 'https:' ? https : http;
    const req  = mod.request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': payload.length },
    });
    req.on('error', e => console.warn(`[hooks:stop] webhook failed: ${e.message}`));
    req.write(payload);
    req.end();
  } catch (e) {
    console.warn(`[hooks:stop] webhook error: ${e.message}`);
  }
}

module.exports = { preToolUse, postToolUse, onStop };
