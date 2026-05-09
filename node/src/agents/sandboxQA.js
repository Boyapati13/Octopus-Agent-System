'use strict';
/**
 * SandboxQA — The Proving Ground (Phase 3 of Skill Evolution Pipeline)
 * Validates auto-synthesized skills in true isolation using worker_threads.
 * Each skill runs in a separate thread with memory limits and a 10 s hard timeout.
 * Self-correcting: on failure, loops back to Toolsmith (up to MAX_RETRIES).
 * Only approved skills proceed to CEO deployment.
 */
const fs       = require('fs');
const path     = require('path');
const { Worker } = require('worker_threads');
const registry = require('../skill_registry');

const name = 'SandboxQA';
const role = 'sandbox-validation';
const canApprove = true;

const MAX_RETRIES = 3;
const TIMEOUT_MS  = 10_000;

// Inline worker script — runs the synthesized skill in a sandboxed thread
const WORKER_SCRIPT = `
const { workerData, parentPort } = require('worker_threads');
async function main() {
  try {
    // Purge any cached version so we always load the freshly written file
    delete require.cache[require.resolve(workerData.execPath)];
    const mod = require(workerData.execPath);
    if (typeof mod.run !== 'function') {
      parentPort.postMessage({ passed: false, error: 'Module does not export a run() function' });
      return;
    }
    // Call with empty args — a well-formed skill returns { error } instead of throwing
    const result = await mod.run({});
    if (result && typeof result === 'object') {
      parentPort.postMessage({ passed: true, result });
    } else {
      parentPort.postMessage({ passed: false, error: 'run() returned null or non-object' });
    }
  } catch (e) {
    parentPort.postMessage({ passed: false, error: e.message });
  }
}
main();
`;

function executeSkillSafely(execPath) {
  if (!fs.existsSync(execPath)) {
    return Promise.resolve({ passed: false, error: `Execution file not found: ${execPath}` });
  }

  return new Promise((resolve) => {
    const worker = new Worker(WORKER_SCRIPT, {
      eval: true,
      workerData: { execPath: path.resolve(execPath) },
      resourceLimits: {
        maxOldGenerationSizeMb: 64,
        maxYoungGenerationSizeMb: 16,
      },
    });

    const timer = setTimeout(() => {
      worker.terminate();
      resolve({ passed: false, error: `Execution timeout (${TIMEOUT_MS / 1000}s)` });
    }, TIMEOUT_MS);

    worker.once('message', (msg) => { clearTimeout(timer); worker.terminate(); resolve(msg); });
    worker.once('error',   (e)   => { clearTimeout(timer); worker.terminate(); resolve({ passed: false, error: e.message }); });
  });
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
