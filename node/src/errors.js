'use strict';

const KINDS = {
  GATE_FAILURE:      'gate_failure',
  PLAN_FAILURE:      'plan_failure',
  SYSTEM_ERROR:      'system_error',
  PERMISSION_DENIED: 'permission_denied',
};

/**
 * Creates a canonical error envelope.
 */
function formatError(kind, message, agent = null, details = {}) {
  return {
    ok: false,
    kind,
    agent,
    message,
    details,
  };
}

class OctopusError extends Error {
  constructor(kind, message, agent = null, details = {}) {
    super(message);
    this.name = 'OctopusError';
    this.envelope = formatError(kind, message, agent, details);
  }
}

module.exports = { KINDS, formatError, OctopusError };
