'use strict';
/**
 * SecurityReviewer — Three-Layer Security Gate (ECC-enhanced)
 *
 * Layer 1 (PreToolUse hook):  synchronous fatal command blocks [hooks.js]
 * Layer 2 (this agent):       OWASP Top 10 quick patterns + AgentShield 5-category scan
 * Layer 3 (opt-in):           ECC red-team/blue-team/auditor pipeline (AGENTSHIELD_MODE=gate)
 *
 * AGENTSHIELD_MODE env var controls AgentShield depth:
 *   none     — skip AgentShield (fastest; use when SecurityReviewer + hooks is sufficient)
 *   advisory — run but don't block on AS findings (default)
 *   gate     — treat critical AS findings as blocking (strictest)
 *
 * Conflict prevention: hooks.js PreToolUse and AgentShield scan different things.
 * PreToolUse = OS-level fatal commands (deterministic, synchronous).
 * AgentShield = source code patterns (semantic, file-level, async).
 * They never overlap — no duplicate firing.
 */
const { loadSkills } = require('../skills');
const { scanFiles, scanMcpConfigs, summarise } = require('../skills/agentshield');
const { registerHookGuard } = require('../hooks');

const name = 'SecurityReviewer';
const role = 'security';
const canApprove = true;

const REQUIRED_SKILLS = ['get_context', 'scan_security', 'writeback'];

const AGENTSHIELD_MODE = (process.env.AGENTSHIELD_MODE || 'advisory').toLowerCase();

// Register this agent's AgentShield scan as a unique hook to prevent duplicates
const AS_HOOK_ID = 'agentshield:securityreviewer:scan';

// OWASP quick patterns (augment the skill-level scan)
const QUICK_PATTERNS = [
  { re: /eval\s*\(/,                       sev: 'critical', label: 'eval() usage — code injection risk (OWASP A03)' },
  { re: /exec\s*\(\s*[`"']/,              sev: 'critical', label: 'Shell injection via exec() (OWASP A03)' },
  { re: /password\s*=\s*["'][^"']+["']/,  sev: 'critical', label: 'Hardcoded password (OWASP A07)' },
  { re: /secret\s*=\s*["'][^"']+["']/,   sev: 'critical', label: 'Hardcoded secret (OWASP A07)' },
  { re: /Math\.random\(\)/,               sev: 'warning',  label: 'Weak RNG — use crypto.randomBytes() (OWASP A02)' },
  { re: /console\.log.*password/i,        sev: 'warning',  label: 'Possible credential logging (OWASP A09)' },
  { re: /process\.env\.\w+\s*\|\|\s*["']/, sev: 'info',   label: 'Env var with insecure fallback' },
  { re: /TODO.*security/i,                sev: 'info',     label: 'Unresolved security TODO' },
];

async function run(input, memory) {
  const { task } = input;
  const skills   = await loadSkills(REQUIRED_SKILLS, memory);

  const ctx       = await skills.get_context(name.toLowerCase(), task, task);
  const files     = ctx?.relevant_files || [];
  const filePaths = files.map(f => f.path).filter(Boolean);

  // ── Layer 2a: OWASP skill scan ────────────────────────────────────────────
  const scanFindings = await skills.scan_security(filePaths) || [];

  // ── Layer 2b: Quick OWASP pattern check on symbols ───────────────────────
  const symbolFindings = [];
  for (const f of files) {
    const content = [...(f.symbols || []), f.summary || ''].join(' ');
    for (const { re, sev, label } of QUICK_PATTERNS) {
      if (re.test(content)) {
        symbolFindings.push({ file: f.path, severity: sev, issue: label, source: 'quick-pattern' });
      }
    }
  }

  // ── Layer 2c: AgentShield 5-category deep scan ────────────────────────────
  let asFindings = [];
  let asEnabled  = false;

  if (AGENTSHIELD_MODE !== 'none' && registerHookGuard(AS_HOOK_ID)) {
    asEnabled = true;
    // Scan source files
    asFindings = scanFiles(filePaths);
    // Scan MCP config files (AS-M rules)
    asFindings.push(...scanMcpConfigs(process.env.PROJECT_ROOT || process.cwd()));
    asFindings = asFindings.map(f => ({ ...f, source: 'agentshield' }));

    const asSummary = summarise(asFindings);
    console.error(`[SecurityReviewer] AgentShield: ${asSummary.total} finding(s) — ${JSON.stringify(asSummary.bySeverity)}`);
  } else if (!registerHookGuard(AS_HOOK_ID)) {
    // Hook already registered this session — skip to avoid duplicate scan
    console.error(`[SecurityReviewer] AgentShield scan skipped — hook guard active (prevent duplicate)`);
  }

  // ── Aggregate ─────────────────────────────────────────────────────────────
  const allFindings = [
    ...scanFindings.map(f => ({ ...f, source: 'owasp-scan' })),
    ...symbolFindings,
    ...asFindings,
  ];

  const bySeverity = allFindings.reduce((acc, f) => {
    acc[f.severity] = (acc[f.severity] || 0) + 1;
    return acc;
  }, {});

  const critical = allFindings.filter(f => f.severity === 'critical');

  // AGENTSHIELD_MODE=gate: AgentShield critical findings also block
  // AGENTSHIELD_MODE=advisory: only OWASP criticals block
  const blockingCritical = AGENTSHIELD_MODE === 'gate'
    ? critical
    : critical.filter(f => f.source !== 'agentshield');

  const approved = blockingCritical.length === 0;

  if (approved) {
    await skills.writeback(name, {
      approval: {
        approved: true,
        note: `Security passed: ${allFindings.length} finding(s), 0 blocking critical (agentshield=${AGENTSHIELD_MODE})`,
        ts: new Date().toISOString(),
      },
    });
  }

  return {
    agent: name, role, task,
    files_scanned:    files.length,
    agentshield_mode: AGENTSHIELD_MODE,
    agentshield_ran:  asEnabled,
    findings:         allFindings,
    by_severity:      bySeverity,
    critical_count:   critical.length,
    blocking_critical: blockingCritical.length,
    critical_items:   blockingCritical,
    approved,
    advice: approved
      ? `✅ Security passed. ${allFindings.length} finding(s): ${JSON.stringify(bySeverity)} [AgentShield: ${AGENTSHIELD_MODE}]`
      : `🚫 BLOCKED: ${blockingCritical.length} critical issue(s) must be resolved.\n${blockingCritical.map(c => `  • [${c.file || 'unknown'}:${c.line || '?'}] ${c.issue}`).join('\n')}`,
  };
}

module.exports = { name, role, canApprove, run };
