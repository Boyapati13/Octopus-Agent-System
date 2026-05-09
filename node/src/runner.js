'use strict';
const { runAgent } = require('./agents');
const { KINDS, OctopusError } = require('./errors');

/**
 * Dynamic Task Runner
 * Executes Cortex's dynamic plan and manages session completion/compaction.
 */
async function runTask(task, memory) {
  console.log(`[runner] Initiating task: "${task}"`);
  
  // 1. Ask Cortex what agents are needed
  const planResult = await runAgent('cortex', { task, query: task }, memory);
  
  if (!planResult || !planResult.plan) {
    throw new OctopusError(
      KINDS.PLAN_FAILURE, 
      'Cortex failed to produce a valid execution plan.', 
      'Cortex', 
      { result: planResult }
    );
  }

  // Cortex returns an array of needed agents in order
  const needed = planResult.plan.map(s => s.agent.toLowerCase());
  
  const results = { cortex: planResult };
  const errors  = [];

  // 2. Run only the needed agents, in order
  for (const agentName of needed) {
    if (agentName === 'cortex') continue; // Already ran
    
    try {
      console.log(`[runner] Spawning ${agentName}…`);
      const result = await runAgent(agentName, { task, query: task }, memory);
      results[agentName] = result;
      
      // If a gate agent returns approved === false, stop the chain
      const gateAgents = ['reviewer', 'securityreviewer', 'probe', 'factchecker', 'releasekeeper'];
      if (gateAgents.includes(agentName) && result.approved === false) {
         console.warn(`[runner] Gate agent ${agentName} failed — stopping chain`);
         throw new OctopusError(
           KINDS.GATE_FAILURE,
           result.advice || 'Gate verification failed',
           agentName,
           { findings: result.findings || [], cautions: result.cautions || [] }
         );
      }
    } catch (err) {
      if (err instanceof OctopusError) throw err; // re-throw intentional errors
      
      console.error(`[runner] Error in ${agentName}:`, err.message);
      errors.push({ agent: agentName, error: err.message });
      
      // If a gate agent throws an unexpected error, fail
      const gateAgents = ['reviewer', 'securityreviewer', 'probe', 'factchecker', 'releasekeeper'];
      if (gateAgents.includes(agentName)) {
        console.warn(`[runner] Gate agent ${agentName} threw error — stopping chain`);
        throw new OctopusError(
          KINDS.SYSTEM_ERROR,
          `Gate agent ${agentName} encountered a system error: ${err.message}`,
          agentName
        );
      }
    }
  }

  // 3. Session compact at end of run
  const approvedCount = Object.values(results).filter(r => r.approved === true).length;
  await memory.compactSession(
    `Task: "${task}" — ${approvedCount} agents approved`,
    [
      `Planned agents: ${needed.join(', ')}`,
      `Ran successfully: ${Object.keys(results).length}`, 
      `Errors: ${errors.length}`
    ]
  );

  return { 
    task, 
    results, 
    errors, 
    agents_spawned: Object.keys(results).filter(a => a !== 'cortex') 
  };
}

module.exports = { runTask };
