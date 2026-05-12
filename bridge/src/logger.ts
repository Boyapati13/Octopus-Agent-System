/**
 * Debug logger for the AgentDeck bridge.
 * Set DEBUG=octopus:* (or any colon-separated namespace) to enable output.
 */

const ENABLED = (process.env.DEBUG || '').split(',').some(ns =>
  ns.trim() === '*' || ns.trim().startsWith('octopus')
);

/**
 * Namespaced debug logger. No-ops unless DEBUG env var matches the namespace.
 * Uses console.error so it does not corrupt MCP stdio.
 */
export function debug(namespace: string, message: string): void {
  if (!ENABLED) return;
  console.error(`[${namespace}] ${message}`);
}
