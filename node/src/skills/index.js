'use strict';
/**
 * Skills Registry
 * Atomic capabilities that agents can load. They share the same memory interface 
 * as agents but enforce narrow scopes of operation.
 */

const SKILL_REGISTRY = {
  // Structural queries
  structural_search:  (memory, q) => memory.searchStructural(q),
  boundary_impact:    (memory, paths) => memory.svcPost('/structural/impact', { paths }),
  
  // Decision memory
  get_decisions:      (memory, tags) => memory.getDecisions(tags),
  save_decision:      (memory, d) => memory.saveDecision(d),
  
  // Run state (L3)
  get_run_state:      (memory) => memory.getRun(),
  update_run:         (memory, patch) => memory.saveRun(patch),
  
  // Agent Context Profile (L5)
  get_context:        (memory, agentName, task, query) => memory.getContext(agentName, task, query),
  
  // Memory Writeback
  writeback:          (memory, agentName, payload) => memory.writeback(agentName, payload)
};

/**
 * Returns an object with the requested skills bound to the memory instance.
 */
async function loadSkills(names, memory) {
  const skills = {};
  for (const name of names) {
    if (SKILL_REGISTRY[name]) {
      skills[name] = (...args) => SKILL_REGISTRY[name](memory, ...args);
    } else {
      console.warn(`[skills] Warning: Requested unknown skill '${name}'`);
    }
  }
  return skills;
}

module.exports = { loadSkills, SKILL_REGISTRY };
