'use strict';
/**
 * SecurityReviewer — Security
 * Scans imports and symbols for risky patterns.
 * Gets only imports/symbols context — never docs or notebook history.
 */
const name = 'SecurityReviewer';
const role = 'security';
const canApprove = true;

const REQUIRED_SKILLS = ['get_run_state', 'writeback', 'get_context', 'scan_security'];

async function run(input, memory) {
  const { loadSkills } = require('../skills');
  const skills = await loadSkills(REQUIRED_SKILLS, memory);
  const { task } = input;
  const ctx = await skills.get_context(name.toLowerCase(), task);
  const files = ctx?.relevant_files || [];
  const filePaths = files.map(f => f.path);
  
  const findings = await skills.scan_security(filePaths);

  const critical = findings.filter(f => f.severity === 'critical');
  const approved = critical.length === 0;

  if (approved) {
    await skills.writeback(name, {
      approval: { approved: true, note: `Security scan: ${findings.length} findings, 0 critical`, ts: new Date().toISOString() },
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
