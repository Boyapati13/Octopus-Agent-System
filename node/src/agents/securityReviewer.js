'use strict';
/**
 * SecurityReviewer — OWASP Security Gate
 * Scans changed files for OWASP Top 10 patterns.
 * Critical findings BLOCK the chain. Non-critical are logged as warnings.
 * GATE: sets approved=false on any critical finding.
 */
const { loadSkills } = require('../skills');

const name = 'SecurityReviewer';
const role = 'security';
const canApprove = true;

const REQUIRED_SKILLS = ['get_context', 'scan_security', 'writeback'];

// Additional in-memory pattern checks (augments the skill-level scan)
const QUICK_PATTERNS = [
  { re: /eval\s*\(/,                    sev: 'critical', label: 'eval() usage — code injection risk (OWASP A03)' },
  { re: /exec\s*\(\s*[`"']/,           sev: 'critical', label: 'Shell injection via exec() (OWASP A03)' },
  { re: /password\s*=\s*["'][^"']+["']/, sev: 'critical', label: 'Hardcoded password (OWASP A07)' },
  { re: /secret\s*=\s*["'][^"']+["']/, sev: 'critical', label: 'Hardcoded secret (OWASP A07)' },
  { re: /Math\.random\(\)/,             sev: 'warning',  label: 'Weak RNG — use crypto.randomBytes() (OWASP A02)' },
  { re: /console\.log.*password/i,      sev: 'warning',  label: 'Possible credential logging (OWASP A09)' },
  { re: /process\.env\.\w+\s*\|\|\s*["']/, sev: 'info', label: 'Env var with insecure fallback' },
  { re: /TODO.*security/i,              sev: 'info',     label: 'Unresolved security TODO' },
];

async function run(input, memory) {
  const { task } = input;
  const skills   = await loadSkills(REQUIRED_SKILLS, memory);

  const ctx      = await skills.get_context(name.toLowerCase(), task, task);
  const files    = ctx?.relevant_files || [];
  const filePaths = files.map(f => f.path);

  // Run the security scanner skill (OWASP Top 10 checks)
  const scanFindings = await skills.scan_security(filePaths) || [];

  // Augment with quick in-memory pattern checks on symbols/summaries
  const symbolFindings = [];
  for (const f of files) {
    const content = [
      ...(f.symbols || []),
      f.summary || '',
    ].join(' ');

    for (const { re, sev, label } of QUICK_PATTERNS) {
      if (re.test(content)) {
        symbolFindings.push({ file: f.path, severity: sev, issue: label, source: 'pattern-scan' });
      }
    }
  }

  const allFindings = [
    ...scanFindings.map(f => ({ ...f, source: 'owasp-scan' })),
    ...symbolFindings,
  ];

  const bySeverity = allFindings.reduce((acc, f) => {
    acc[f.severity] = (acc[f.severity] || 0) + 1;
    return acc;
  }, {});

  const critical = allFindings.filter(f => f.severity === 'critical');
  const approved = critical.length === 0;

  if (approved) {
    await skills.writeback(name, {
      approval: {
        approved: true,
        note: `Security passed: ${allFindings.length} finding(s), 0 critical`,
        ts: new Date().toISOString(),
      },
    });
  }

  return {
    agent: name, role, task,
    files_scanned:   files.length,
    findings:        allFindings,
    by_severity:     bySeverity,
    critical_count:  critical.length,
    critical_items:  critical,
    approved,
    advice: approved
      ? `✅ Security passed. ${allFindings.length} finding(s): ${JSON.stringify(bySeverity)}`
      : `🚫 BLOCKED: ${critical.length} critical issue(s) must be resolved.\n${critical.map(c => `  • [${c.file}] ${c.issue}`).join('\n')}`,
  };
}

module.exports = { name, role, canApprove, run };
