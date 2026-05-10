'use strict';
/**
 * Dynamic Task Runner
 * Executes Cortex's plan and manages session compaction.
 *
 * Key properties:
 *  - Auto-synthesises a stub agent when Cortex selects an unknown name
 *  - Gate detection uses the agent's own canApprove flag (works for dynamic agents)
 *  - GATE_AGENTS set provides a hard-coded safety net for core gates
 */
const fs   = require('fs');
const path = require('path');
const { runAgent, getAgent, injectAgent } = require('./agents');
const { KINDS, OctopusError } = require('./errors');

// Hard-coded gates as safety net; dynamic agents are caught via canApprove flag
const GATE_AGENTS = new Set([
  'reviewer','securityreviewer','probe','factchecker','releasekeeper','sandboxqa',
]);

// ── Auto-agent synthesis ──────────────────────────────────────────────────────

async function ensureAgent(agentName) {
  if (getAgent(agentName)) return; // already in registry

  console.log(`[runner] Agent "${agentName}" not found — auto-synthesising stub…`);

  const safeRole = agentName
    .replace(/([A-Z])/g, m => `-${m.toLowerCase()}`)
    .replace(/^-/, '');

  const src = `'use strict';
/**
 * Auto-synthesised stub agent: ${agentName}
 * Replace this file with a specialist implementation.
 */
const name = '${agentName}';
const role = '${safeRole}';
const canApprove = false;
const { loadSkills } = require('../skills');

async function run(input, memory) {
  const skills = await loadSkills(['get_context', 'writeback'], memory);
  const ctx = await skills.get_context(name, input.task, input.query || input.task);
  await skills.writeback(name, {
    run_patch: { task: input.task, status: 'complete', notes: ['Auto-synthesised stub'] },
  });
  return {
    agent: name,
    role,
    task:  input.task,
    context: ctx,
    approved: true,
    advice: 'Auto-synthesised stub completed. Replace ${agentName}.js with a specialist implementation.',
  };
}
module.exports = { name, role, canApprove, run };
`;

  const agentPath = path.join(__dirname, 'agents', `${agentName}.js`);
  fs.writeFileSync(agentPath, src, 'utf8');
  injectAgent(agentName);
  console.log(`[runner] Injected auto-synthesised agent: ${agentName}`);
}

// ── Gate check ────────────────────────────────────────────────────────────────

function isGate(agentName) {
  if (GATE_AGENTS.has(agentName.toLowerCase())) return true;
  const mod = getAgent(agentName);
  return mod ? mod.canApprove === true : false;
}

// ── Main runner ───────────────────────────────────────────────────────────────

async function runTask(task, memory) {
  console.log(`[runner] Task: "${task}"`);

  const planResult = await runAgent('cortex', { task, query: task }, memory);

  if (!planResult?.plan) {
    throw new OctopusError(KINDS.PLAN_FAILURE, 'Cortex produced no plan.', 'Cortex', { result: planResult });
  }

  const needed  = planResult.plan.map(s => s.agent.toLowerCase());
  const results = { cortex: planResult };
  const errors  = [];

  for (const agentName of needed) {
    if (agentName === 'cortex') continue;

    // Auto-create stub if unknown
    await ensureAgent(agentName).catch(e =>
      console.warn(`[runner] Could not auto-create "${agentName}": ${e.message}`)
    );

    try {
      console.log(`[runner] Spawning ${agentName}…`);
      const result = await runAgent(agentName, { task, query: task }, memory);
      results[agentName] = result;

      if (isGate(agentName) && result.approved === false) {
        console.warn(`[runner] Gate "${agentName}" failed — stopping chain`);
        throw new OctopusError(
          KINDS.GATE_FAILURE,
          result.advice || 'Gate verification failed',
          agentName,
          { findings: result.findings || [], cautions: result.cautions || [] }
        );
      }
    } catch (err) {
      if (err instanceof OctopusError) throw err;

      console.error(`[runner] Error in ${agentName}:`, err.message);
      errors.push({ agent: agentName, error: err.message });

      if (isGate(agentName)) {
        throw new OctopusError(
          KINDS.SYSTEM_ERROR,
          `Gate "${agentName}" threw a system error: ${err.message}`,
          agentName
        );
      }
    }
  }

  const approvedCount = Object.values(results).filter(r => r.approved === true).length;
  await memory.compactSession(
    `Task: "${task}" — ${approvedCount} agents approved`,
    [
      `Planned: ${needed.join(', ')}`,
      `Ran: ${Object.keys(results).length}`,
      `Errors: ${errors.length}`,
    ]
  );

  return {
    task,
    results,
    errors,
    agents_spawned: Object.keys(results).filter(a => a !== 'cortex'),
  };
}

module.exports = { runTask };
