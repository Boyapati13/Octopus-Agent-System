'use strict';
/**
 * Least-Privilege Agent Permission Matrix
 *
 * Each agent receives a Proxy-wrapped memory object that only exposes
 * the methods its role legitimately needs. Any call outside the allowlist
 * throws PERMISSION_DENIED synchronously — no AI tokens, no audit trail needed.
 *
 * Threat model: a hallucinating LLM generates agent code that calls a
 * destructive method (e.g. Scribe calling compactSession to wipe run state).
 * The Proxy intercepts and rejects it before any damage occurs.
 */
const { KINDS, OctopusError } = require('./errors');

// ── Per-agent method allowlists ───────────────────────────────────────────────

const AGENT_PERMISSIONS = {
  cortex: [
    'getContext', 'getRun', 'getDecisions', 'getInstincts',
    'writeback', 'compactSession', 'getCacheStats',
  ],
  atlas: [
    'searchStructural', 'getContext', 'structuralImpact',
  ],
  architect: [
    'searchStructural', 'getContext', 'getDecisions', 'getInstincts',
    'writeback', 'structuralImpact',
  ],
  forge: [
    'searchStructural', 'getContext', 'getDecisions', 'getRun', 'getInstincts',
    'writeback', 'saveDecision', 'structuralImpact',
  ],
  reviewer: [
    'searchStructural', 'getContext', 'getRun', 'writeback',
  ],
  securityreviewer: [
    'searchStructural', 'getContext', 'getInstincts', 'writeback', 'structuralImpact',
  ],
  probe: [
    'searchStructural', 'getContext', 'getRun', 'writeback',
  ],
  factchecker: [
    'searchStructural', 'getContext', 'getDecisions', 'writeback',
  ],
  scribe: [
    'getContext', 'getDecisions', 'getRun', 'writeback',
  ],
  releasekeeper: [
    'getRun', 'getContext', 'writeback', 'saveRun',
  ],
  navigator: [
    'getContext', 'writeback',
  ],
  marketscout: [
    'getContext', 'getInstincts', 'writeback',
  ],
  toolsmith: [
    'getContext', 'getInstincts', 'writeback',
  ],
  sandboxqa: [
    'getContext', 'writeback',
  ],
};

// Pure utility methods — always accessible, never destructive
const PUBLIC_METHODS = new Set(['loadLocalStructural', 'findRelevantFiles']);

// ── Permission proxy factory ──────────────────────────────────────────────────

/**
 * Returns a Proxy-wrapped memory object restricted to the agent's allowlist.
 * Unknown agents get the empty set (read-only public utilities only).
 */
function createPermissionProxy(agentName, memory) {
  const key     = agentName.toLowerCase();
  const allowed = new Set(AGENT_PERMISSIONS[key] || []);

  return new Proxy(memory, {
    get(target, prop, receiver) {
      if (typeof prop !== 'string')       return Reflect.get(target, prop, receiver);
      if (PUBLIC_METHODS.has(prop))       return Reflect.get(target, prop, receiver);
      if (typeof target[prop] !== 'function') return Reflect.get(target, prop, receiver);
      if (allowed.has(prop))              return Reflect.get(target, prop, receiver);

      // Return a function that throws synchronously when called
      return function permissionDenied() {
        throw new OctopusError(
          KINDS.PERMISSION_DENIED,
          `Agent "${agentName}" is not permitted to call memory.${prop}()`,
          agentName,
          { method: prop }
        );
      };
    },
  });
}

module.exports = { AGENT_PERMISSIONS, createPermissionProxy };
