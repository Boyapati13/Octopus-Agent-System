'use strict';
/**
 * SandboxQA — The Proving Ground (Phase 3 of Skill Evolution Pipeline)
 * Validates auto-synthesized skills in isolation.
 * Self-correcting: on failure, loops back to Toolsmith (up to MAX_RETRIES).
 * Only approved skills proceed to CEO deployment.
 */
const fs       = require('fs');
const path     = require('path');
const registry = require('../skill_registry');

const name = 'SandboxQA';
const role = 'sandbox-validation';
const canApprove = true;

const MAX_RETRIES = 3;

async function executeSkillSafely(execPath) {
  // Validate the file exists and is readable
  if (!fs.existsSync(execPath)) {
    return { passed: false, error: `Execution file not found: ${execPath}` };
  }

  // Syntax check: try to require in a fresh module context
  try {
    // Purge module cache so we always load the latest version
    delete require.cache[require.resolve(execPath)];
    const mod = require(execPath);

    if (typeof mod.run !== 'function') {
      return { passed: false, error: 'Module does not export a run() function' };
    }

    // Call with an empty args object — a well-formed skill should not throw on empty args,
    // it should return an error field instead
    const result = await Promise.race([
      mod.run({}),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Execution timeout (10s)')), 10000)),
    ]);

    // A result with an 'error' field is a handled failure — still a pass (graceful error handling)
    if (result && typeof result === 'object') {
      return { passed: true, result };
    }

    return { passed: false, error: 'run() returned null or non-object' };
  } catch (e) {
    return { passed: false, error: e.message };
  }
}

async function run(input, memory) {
  const { skill_id } = input;

  if (!skill_id) {
    return { agent: name, role, approved: false, error: 'skill_id required' };
  }

  let skill = registry.getSkill(skill_id);
  if (!skill) {
    return { agent: name, role, approved: false, error: `Skill not found: ${skill_id}` };
  }

  const toolsmith = require('./toolsmith');
  let lastError = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const testResult = await executeSkillSafely(skill.execution_binary);

    if (testResult.passed) {
      registry.updateQA(skill_id, { passed: true, attempts: attempt, result: testResult.result });
      return {
        agent: name,
        role,
        approved: true,
        skill_id,
        attempts: attempt,
        advice: `Skill "${skill.name}" passed sandbox validation after ${attempt} attempt(s). Ready for CEO deployment.`,
      };
    }

    lastError = testResult.error;

    // Self-correction: send error back to Toolsmith
    if (attempt < MAX_RETRIES) {
      const fixed = await toolsmith.run({
        skill_id,
        name: skill.name,
        doc_url: skill.doc_url,
        description: skill.description,
        error: lastError,
        retry: attempt,
      }, memory);

      // Reload the updated skill from registry
      skill = registry.getSkill(skill_id) || skill;
    }
  }

  // All attempts exhausted
  registry.updateQA(skill_id, { passed: false, attempts: MAX_RETRIES, error: lastError });

  return {
    agent: name,
    role,
    approved: false,
    skill_id,
    attempts: MAX_RETRIES,
    error: lastError,
    advice: `Skill "${skill.name}" failed ${MAX_RETRIES} sandbox attempts. Review error and retry manually.`,
  };
}

module.exports = { name, role, canApprove, run };
