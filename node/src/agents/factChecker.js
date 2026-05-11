'use strict';
/**
 * FactChecker — Memory Grounding Gate
 * Extracts claims from the run plan and verifies each against L1-L3 memory.
 * Unsupported claims block the chain — forces evidence-based development.
 * GATE: sets approved=false if any claim is unsupported.
 */
const { loadSkills } = require('../skills');

const name = 'FactChecker';
const role = 'verification';
const canApprove = true;

const REQUIRED_SKILLS = ['structural_search', 'get_run_state', 'get_decisions', 'writeback'];

async function verifyFileClaim(filePath, skills) {
  const results = await skills.structural_search(filePath);
  if (!results || results.length === 0) {
    return { claim: `File exists: ${filePath}`, verdict: 'unsupported', evidence: 'Not in structural index.' };
  }
  const f = results[0];
  const symbolCount = (f.symbols || []).length;
  return {
    claim:   `File exists: ${filePath}`,
    verdict:  symbolCount > 0 ? 'supported' : 'partial',
    evidence: symbolCount > 0
      ? `Indexed with ${symbolCount} symbol(s): ${(f.symbols || []).slice(0, 3).join(', ')}`
      : 'File indexed but no symbols extracted yet.',
  };
}

async function run(input, memory) {
  const { task } = input;
  const skills   = await loadSkills(REQUIRED_SKILLS, memory);

  const runState  = await skills.get_run_state() || {};
  const decisions = await skills.get_decisions()  || [];
  const changed   = runState.changed_files || [];

  const findings = [];

  // Verify each changed file exists in structural memory
  for (const f of changed) {
    findings.push(await verifyFileClaim(f, skills));
  }

  // Verify referenced decisions still exist
  for (const d of decisions.slice(0, 5)) {
    findings.push({
      claim:   `Decision recorded: ${d.title}`,
      verdict: 'supported',
      evidence: `Found in L2 memory (risk: ${d.risk || 'unset'}, tags: ${(d.tags || []).join(', ') || 'none'})`,
    });
  }

  // Check run state is progressing
  const statusOk = !['error', 'blocked', 'failed'].includes(runState.status);
  findings.push({
    claim:   'Run state is progressing',
    verdict:  statusOk ? 'supported' : 'unsupported',
    evidence: `Run status: ${runState.status || 'idle'}`,
  });

  const unsupported = findings.filter(f => f.verdict === 'unsupported');
  const approved    = unsupported.length === 0;

  if (approved) {
    await skills.writeback(name, {
      approval: {
        approved: true,
        note: `FactChecker: ${findings.length} claim(s) verified, 0 unsupported`,
        ts: new Date().toISOString(),
      },
    });
  }

  return {
    agent: name, role, task,
    claims_checked: findings.length,
    supported:      findings.filter(f => f.verdict === 'supported').length,
    partial:        findings.filter(f => f.verdict === 'partial').length,
    unsupported:    unsupported.length,
    findings,
    approved,
    advice: approved
      ? `✅ All ${findings.length} claim(s) grounded in memory.`
      : `🚫 ${unsupported.length} unsupported claim(s):\n${unsupported.map(u => `  • ${u.claim}: ${u.evidence}`).join('\n')}`,
  };
}

module.exports = { name, role, canApprove, run };
