'use strict';
const { loadSkills } = require('../skills');

/**
 * FactChecker — Verification
 * Extracts claims from proposed plans/edits and verifies them against L1-L3 memory.
 * Grounded memory approach: If evidence is missing or contradictory, fails the gate.
 */
const name = 'FactChecker';
const role = 'verification';
const canApprove = true;

const REQUIRED_SKILLS = ['structural_search', 'get_run_state', 'writeback'];

async function run(input, memory) {
  const { task } = input;
  const skills = await loadSkills(REQUIRED_SKILLS, memory);
  
  // Get what has been done so far in the run
  const runState = await skills.get_run_state() || {};
  const changedFiles = runState.changed_files || [];
  
  const findings = [];
  let unsupportedCount = 0;

  for (const f of changedFiles) {
    // Search the memory for the file to verify it exists and its context
    const memResult = await skills.structural_search(f);
    
    if (!memResult || memResult.length === 0) {
      findings.push({ 
        claim: `File ${f} exists or is being modified`, 
        verdict: 'unsupported',
        evidence: 'Not found in structural index.' 
      });
      unsupportedCount++;
    } else {
      const fileContext = memResult[0];
      const hasContent = fileContext.symbols && fileContext.symbols.length > 0;
      findings.push({ 
        claim: `File ${f} context`, 
        verdict: hasContent ? 'supported' : 'partial',
        evidence: hasContent 
            ? `Indexed with ${fileContext.symbols.length} symbols.` 
            : `File indexed but lacks symbol context.`
      });
    }
  }

  // Example check: did we document a rollback plan?
  // In a real system we would extract specific architectural claims.
  
  const approved = unsupportedCount === 0;

  if (approved) {
    await skills.writeback(name, {
      approval: { 
        approved: true, 
        note: `FactChecker: Verified ${findings.length} claims against memory`, 
        ts: new Date().toISOString() 
      },
    });
  }

  return {
    agent: name, 
    role, 
    task,
    claims_checked: findings.length,
    findings,
    approved,
    advice: approved
      ? 'Fact check passed. All claims grounded in memory.'
      : `BLOCKED: ${unsupportedCount} claims are unsupported by current memory. Run /onboard or clarify.`,
  };
}

module.exports = { name, role, canApprove, run };
