'use strict';
/**
 * SecurityReviewer — Security
 * Scans imports and symbols for risky patterns.
 * Gets only imports/symbols context — never docs or notebook history.
 */
const name = 'SecurityReviewer';
const role = 'security';
const canApprove = true;

const RISKY = {
  js: [
    { re: /\beval\s*\(/,                        sev: 'critical', label: 'eval() usage' },
    { re: /child_process\.exec\s*\(/,            sev: 'critical', label: 'child_process.exec' },
    { re: /require\s*\(\s*[^'"]/,               sev: 'high',     label: 'dynamic require()' },
    { re: /\.innerHTML\s*=/,                     sev: 'high',     label: 'innerHTML XSS risk' },
    { re: /new\s+Function\s*\(/,                 sev: 'high',     label: 'new Function() usage' },
    { re: /process\.env\b/,                      sev: 'low',      label: 'env var access' },
  ],
  py: [
    { re: /\beval\s*\(/,                         sev: 'critical', label: 'eval() usage' },
    { re: /\bexec\s*\(/,                         sev: 'critical', label: 'exec() usage' },
    { re: /os\.system\s*\(/,                     sev: 'critical', label: 'os.system() call' },
    { re: /subprocess\.\w+\(.*shell\s*=\s*True/, sev: 'critical', label: 'subprocess shell=True' },
    { re: /pickle\.loads?\s*\(/,                 sev: 'high',     label: 'pickle deserialization' },
    { re: /\binput\s*\(/,                        sev: 'low',      label: 'unvalidated input()' },
  ],
};

async function run(input, memory) {
  const { task } = input;
  const ctx = await memory.getContext('security-reviewer', task);
  const files = ctx?.relevant_files || [];

  const findings = [];
  for (const f of files) {
    const ext = f.path.endsWith('.py') ? 'py' : 'js';
    const patterns = RISKY[ext] || [];
    const text = [
      f.path,
      ...(f.symbols || []),
      ...(f.imports || []),
      f.summary || '',
    ].join(' ');
    for (const p of patterns) {
      if (p.re.test(text)) {
        findings.push({ file: f.path, severity: p.sev, issue: p.label });
      }
    }
  }

  const critical = findings.filter(f => f.severity === 'critical');
  const approved = critical.length === 0;

  if (approved) {
    await memory.writeback(name, {
      approval: { approved: true, note: `Security scan: ${findings.length} low/high findings, 0 critical`, ts: new Date().toISOString() },
    });
  }

  return {
    agent: name, role, task,
    files_scanned: files.length,
    findings,
    critical_count: critical.length,
    approved,
    advice: approved
      ? `Security passed. ${findings.length} non-critical finding(s) noted.`
      : `BLOCKED: ${critical.length} critical issue(s) must be resolved before release.`,
  };
}

module.exports = { name, role, canApprove, run };
