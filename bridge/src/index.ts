/**
 * AgentDeck Bridge — Octopus entry point.
 *
 * For the full AgentDeck daemon (all 13 surfaces, Stream Deck+ plugin, etc.)
 * see the AgentDeck monorepo: https://github.com/puritysb/AgentDeck
 *
 * This package contains the Octopus-specific bridge components:
 *   OctopusAdapter    — AgentDeck adapter for Octopus sessions
 *   OctopusClient     — HTTP + WebSocket client for the Octopus REST API
 *   OctopusDeckLayout — Stream Deck+ 8-key / 4-encoder layout definitions
 *   ApmOctopusBridge  — APME session eval → Octopus Instincts feedback loop
 */
export { OctopusAdapter } from './adapters/octopus-adapter.js';
export { OctopusClient } from './octopus/octopus-client.js';
export {
  octopusEventToDeckState,
  planToEncoderLabel,
  OCTOPUS_KEYS,
  OCTOPUS_ENCODERS,
  OCTOPUS_KEY_COLORS,
  OCTOPUS_LLM_PROVIDERS,
  DEFAULT_DECK_STATE,
} from './octopus/octopus-deck-layout.js';
export {
  apmOctopusBridge,
  ApmOctopusBridge,
} from './octopus/apme-octopus-bridge.js';
export { createAdapter } from './adapters/index.js';
export type {
  AgentAdapter,
  AgentCapabilities,
  AgentType,
  AdapterEvent,
  AdapterStartOptions,
  PluginCommand,
} from './types.js';
