'use strict';
/**
 * Deterministic Hook System — Pre/PostToolUse + Stop
 *
 * Layer 1 (this file): token-free, synchronous guardrails.
 * Layer 2: ECC AgentShield in SecurityReviewer (semantic, LLM-assisted).
 * Layer 3: Octopus SecurityReviewer GATE (OWASP + quick patterns).
 *
 * Conflict prevention: hooks are keyed by ID in REGISTERED_HOOKS.
 * Calling registerHookGuard() for an already-registered ID is a no-op.
 * This prevents duplicate firing when both Octopus and ECC hooks are active.
 *
 * Profile levels (ECC-compatible ECC_HOOK_PROFILE env var):
 *   minimal  — fatal command blocks only
 *   standard — fatal + code quality warnings (default)
 *   strict   — fatal + quality + extra security checks
 */
const { execSync } = require('child_process');
const fs     = require('fs');
const path   = require('path');
const https  = require('https');
const http   = require('http');
const { KINDS, OctopusError } = require('./errors');

const HOOK_PROFILE = (process.env.ECC_HOOK_PROFILE || 'standard').toLowerCase();

// ── Hook deduplication registry ───────────────────────────────────────────────

const REGISTERED_HOOKS = new Set();

function registerHookGuard(id) {
  if (REGISTERED_HOOKS.has(id)) return false; // already registered — skip
  REGISTERED_HOOKS.add(id);
  return true;
}

// ── Fatal patterns — blocked instantly, zero AI tokens ────────────────────────

const FATAL_COMMAND_PATTERNS = [
  // Unix destructive
  /rm\s+-[rRfF]{1,2}\s+\/\s*$/,
  /rm\s+-[rRfF]{1,2}\s+\/\*/,
  /rm\s+-[rRfF]{1,2}\s+~\s*$/,
  /mkfs\b/i,
  /:\s*\(\s*\)\s*\{.*:\|:.*\}/,
  /dd\s+.*\bof=\/dev\/[sh]d[a-z]/i,
  />\s*\/dev\/[sh]d[a-z]\b/,
  /chmod\s+-R\s+777\s+\//i,
  // Windows/PowerShell destructive
  /Remove-Item\s+.*-Recurse.*-Force\s+[A-Z]:\\/i,  // recursive delete from drive root
  /Format-Volume\b/i,                               // format a drive
  /Clear-Disk\b/i,                                  // wipe disk
  /Initialize-Disk\b/i,                             // reinitialize disk
  /reg\s+delete\s+HKLM\\SYSTEM/i,                  // delete critical registry hive
  /reg\s+delete\s+HKLM\\SOFTWARE\\Microsoft/i,     // delete core Windows registry
  /bcdedit.*\/delete/i,                             // delete boot entry
  /Stop-Computer\b/i,                               // system shutdown
  /Restart-Computer\b/i,                            // system restart
  /Disable-WindowsOptionalFeature.*-FeatureName\s+\w+/i, // disable OS features
];

const FATAL_SQL_PATTERNS = [
  /\bDROP\s+DATABASE\b/i,
  /\bDROP\s+SCHEMA\b/i,
  /\bDROP\s+TABLE\b(?!\s+IF\s+EXISTS\s+\w*_test\b)/i,
  /\bTRUNCATE\s+TABLE\b(?!\s+\w*_test\b)/i,
  /\bDELETE\s+FROM\s+\w+\s*(?:;|$)/i,
];

// ── Quality patterns (standard + strict profiles) ─────────────────────────────

const QUALITY_CHECKS = [
  {
    re: /console\.log\s*\(/g,
    level: 'standard',
    warn: (count, file) =>
      `[hooks:post] ⚠ ${count} console.log() found in ${file} — use console.error() for debug output or remove before production`,
  },
  {
    re: /\bvar\s+/g,
    level: 'standard',
    warn: (count, file) =>
      `[hooks:post] ⚠ ${count} var declaration(s) in ${file} — ECC coding-standard: prefer const/let`,
  },
  {
    re: /:\s*any\b/g,
    level: 'standard',
    warn: (count, file) =>
      `[hooks:post] ⚠ ${count} TypeScript "any" type(s) in ${file} — ECC: use explicit interfaces`,
  },
  {
    re: /catch\s*\([^)]*\)\s*\{\s*\}/g,
    level: 'strict',
    warn: (count, file) =>
      `[hooks:post] ⚠ ${count} empty catch block(s) in ${file} — silent error swallowing`,
  },
  {
    re: /\.innerHTML\s*=/g,
    level: 'strict',
    warn: (count, file) =>
      `[hooks:post] 🚨 innerHTML assignment in ${file} — XSS risk (OWASP A03)`,
  },
  {
    re: /Math\.random\s*\(\s*\)/g,
    level: 'strict',
    warn: (count, file) =>
      `[hooks:post] ⚠ Math.random() in ${file} — not cryptographically secure`,
  },
];

const PROFILE_LEVEL = { minimal: 0, standard: 1, strict: 2 };
const CURRENT_LEVEL = PROFILE_LEVEL[HOOK_PROFILE] ?? 1;

// ── PreToolUse — synchronous, called before any tool logic ────────────────────

function preToolUse(toolName, args) {
  if (toolName !== 'octopus_execute_command') return;

  const cmd = (args.command || '').trim();

  for (const pattern of FATAL_COMMAND_PATTERNS) {
    if (pattern.test(cmd)) {
      throw new OctopusError(
        KINDS.PERMISSION_DENIED,
        `PreToolUse [Octopus]: fatal command blocked — "${cmd.slice(0, 80)}"`,
        'hooks',
        { hook: 'PreToolUse', pattern: pattern.toString(), command: cmd }
      );
    }
  }

  for (const pattern of FATAL_SQL_PATTERNS) {
    if (pattern.test(cmd)) {
      throw new OctopusError(
        KINDS.PERMISSION_DENIED,
        `PreToolUse [Octopus]: dangerous SQL blocked — "${cmd.slice(0, 80)}"`,
        'hooks',
        { hook: 'PreToolUse', pattern: pattern.toString(), command: cmd }
      );
    }
  }
}

// ── PostToolUse — async, fires after octopus_write_file ───────────────────────

async function postToolUse(toolName, args) {
  if (toolName !== 'octopus_write_file') return;

  const filePath = args.path || '';
  const ext      = path.extname(filePath).toLowerCase();
  const JS_EXTS  = new Set(['.js', '.ts', '.jsx', '.tsx', '.mjs', '.cjs']);

  if (!JS_EXTS.has(ext)) return;

  const opts = { timeout: 15000, stdio: 'ignore', windowsHide: true };

  // Auto-format (ECC PostToolUse hook behaviour)
  try {
    try {
      execSync(`npx prettier --write "${filePath}"`, opts);
      console.error(`[hooks:post] prettier formatted ${filePath}`);
    } catch {
      execSync(`npx eslint --fix "${filePath}"`, opts);
      console.error(`[hooks:post] eslint --fix applied to ${filePath}`);
    }
  } catch (e) {
    console.warn(`[hooks:post] auto-format skipped for ${filePath}: ${e.message}`);
  }

  // ECC code-quality warnings (non-blocking)
  if (CURRENT_LEVEL >= PROFILE_LEVEL.standard) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      for (const { re, level, warn } of QUALITY_CHECKS) {
        if (PROFILE_LEVEL[level] > CURRENT_LEVEL) continue;
        const matches = content.match(new RegExp(re.source, re.flags));
        if (matches && matches.length > 0) {
          console.warn(warn(matches.length, path.basename(filePath)));
        }
      }
    } catch { /* file gone between write and read — skip */ }
  }
}

// ── onStop — fires at end of runTask() ───────────────────────────────────────

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
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': payload.length },
    });
    req.on('error', e => console.warn(`[hooks:stop] webhook failed: ${e.message}`));
    req.write(payload);
    req.end();
  } catch (e) {
    console.warn(`[hooks:stop] webhook error: ${e.message}`);
  }
}

module.exports = { preToolUse, postToolUse, onStop, registerHookGuard, REGISTERED_HOOKS };
