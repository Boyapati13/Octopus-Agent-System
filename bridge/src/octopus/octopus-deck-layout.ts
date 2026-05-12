/**
 * OctopusDeckLayout
 * ─────────────────
 * Defines the Stream Deck+ key and encoder layout for Octopus agent sessions.
 *
 * Layout (8 keys + 4 encoders):
 *
 *  ┌────────┬────────┬────────┬────────┐
 *  │  K1    │  K2    │  K3    │  K4    │
 *  │ PLAN   │ RUN    │ STOP   │ AGENTS │  Row 1
 *  └────────┴────────┴────────┴────────┘
 *  ┌────────┬────────┬────────┬────────┐
 *  │  K5    │  K6    │  K7    │  K8    │
 *  │SECURITY│ MEMORY │INSTINCT│ SHIELD │  Row 2
 *  └────────┴────────┴────────┴────────┘
 *
 *  Encoders (LCD touch strip):
 *   E1: Task prompt  — rotate to scroll history, press to send
 *   E2: Agent focus  — rotate to select agent, press to view details
 *   E3: Memory query — rotate to browse, press to search
 *   E4: LLM provider — rotate to switch provider (Claude/GPT/Gemini/Ollama)
 *
 * Key colors:
 *   Planning  → blue  (#1F4E79)
 *   Running   → amber (#F0A500)
 *   Gate pass → green (#00C853)
 *   Gate fail → red   (#D32F2F)
 *   Idle      → grey  (#424242)
 *   Security  → orange (#E65100)
 */

import type { OctopusEvent } from '../octopus/octopus-client.js';
import type { OctopusPlan } from '../octopus/octopus-client.js';

// Key slot indices (0-based)
export const OCTOPUS_KEYS = {
  PLAN: 0,
  RUN: 1,
  STOP: 2,
  AGENTS: 3,
  SECURITY: 4,
  MEMORY: 5,
  INSTINCTS: 6,
  SHIELD: 7,
} as const;

// Encoder slot indices
export const OCTOPUS_ENCODERS = {
  TASK: 0,
  AGENT: 1,
  MEMORY: 2,
  PROVIDER: 3,
} as const;

export type OctopusKeyColor =
  | 'idle'
  | 'planning'
  | 'running'
  | 'gate_pass'
  | 'gate_fail'
  | 'security'
  | 'disabled';

export const OCTOPUS_KEY_COLORS: Record<OctopusKeyColor, string> = {
  idle: '#424242',
  planning: '#1F4E79',
  running: '#F0A500',
  gate_pass: '#00C853',
  gate_fail: '#D32F2F',
  security: '#E65100',
  disabled: '#1A1A1A',
};

export interface OctopusDeckState {
  keyColors: Record<number, OctopusKeyColor>;
  encoderLabels: Record<number, string>;
  lcdText: string;
  lcdSubtext: string;
}

export const DEFAULT_DECK_STATE: OctopusDeckState = {
  keyColors: {
    [OCTOPUS_KEYS.PLAN]: 'idle',
    [OCTOPUS_KEYS.RUN]: 'idle',
    [OCTOPUS_KEYS.STOP]: 'disabled',
    [OCTOPUS_KEYS.AGENTS]: 'idle',
    [OCTOPUS_KEYS.SECURITY]: 'idle',
    [OCTOPUS_KEYS.MEMORY]: 'idle',
    [OCTOPUS_KEYS.INSTINCTS]: 'idle',
    [OCTOPUS_KEYS.SHIELD]: 'idle',
  },
  encoderLabels: {
    [OCTOPUS_ENCODERS.TASK]: 'Task',
    [OCTOPUS_ENCODERS.AGENT]: 'Agent',
    [OCTOPUS_ENCODERS.MEMORY]: 'Memory',
    [OCTOPUS_ENCODERS.PROVIDER]: 'LLM',
  },
  lcdText: '🐙 OctoDeck',
  lcdSubtext: 'Ready — send a task prompt',
};

/**
 * Map an incoming Octopus event to a partial deck state update.
 * Call from OctopusAdapter event handler to update the plugin UI.
 */
export function octopusEventToDeckState(
  ev: OctopusEvent,
  current: OctopusDeckState
): Partial<OctopusDeckState> {
  switch (ev.type) {
    case 'chain_start':
      return {
        keyColors: {
          ...current.keyColors,
          [OCTOPUS_KEYS.RUN]: 'running',
          [OCTOPUS_KEYS.STOP]: 'running',
          [OCTOPUS_KEYS.PLAN]: 'planning',
        },
        lcdText: `🐙 ${ev.data.task.slice(0, 48)}`,
        lcdSubtext: ev.data.plan ? `→ ${ev.data.plan.join(' → ')}` : 'Starting chain…',
      };

    case 'agent_start':
      return {
        keyColors: {
          ...current.keyColors,
          [OCTOPUS_KEYS.AGENTS]: 'running',
        },
        lcdSubtext: `[${ev.data.agent}] ${ev.data.role}`,
      };

    case 'agent_done': {
      const color: OctopusKeyColor = ev.data.approved ? 'gate_pass' : 'gate_fail';
      return {
        keyColors: { ...current.keyColors, [OCTOPUS_KEYS.AGENTS]: color },
        lcdSubtext: `${ev.data.approved ? '✅' : '⛔'} ${ev.data.agent}`,
      };
    }

    case 'gate_fail':
      return {
        keyColors: { ...current.keyColors, [OCTOPUS_KEYS.AGENTS]: 'gate_fail' },
        lcdSubtext: `⛔ Gate: ${ev.data.agent} — ${ev.data.reason.slice(0, 40)}`,
      };

    case 'chain_done':
      return {
        keyColors: {
          ...current.keyColors,
          [OCTOPUS_KEYS.RUN]: ev.data.success ? 'gate_pass' : 'gate_fail',
          [OCTOPUS_KEYS.STOP]: 'disabled',
          [OCTOPUS_KEYS.AGENTS]: ev.data.success ? 'gate_pass' : 'gate_fail',
        },
        lcdText: ev.data.success ? '✅ Chain complete' : '⛔ Chain failed',
        lcdSubtext: ev.data.duration_ms
          ? `Duration: ${(ev.data.duration_ms / 1000).toFixed(1)}s`
          : '',
      };

    case 'instinct_new':
      return {
        keyColors: { ...current.keyColors, [OCTOPUS_KEYS.INSTINCTS]: 'gate_pass' },
        lcdSubtext: `🧠 Instinct (${ev.data.confidence.toFixed(2)}): ${ev.data.pattern.slice(0, 40)}`,
      };

    case 'disconnected':
      return {
        ...DEFAULT_DECK_STATE,
        lcdText: '🐙 OctoDeck',
        lcdSubtext: '⚠ Octopus disconnected',
      };

    case 'connected':
      return DEFAULT_DECK_STATE;

    default:
      return {};
  }
}

/**
 * Build the LCD strip label for a given plan.
 * Used by E2 (Agent encoder) to cycle through the planned agent sequence.
 */
export function planToEncoderLabel(plan: OctopusPlan, selectedIdx: number): string {
  const agent = plan.agents[selectedIdx % plan.agents.length];
  return agent ? `[${selectedIdx + 1}/${plan.agents.length}] ${agent}` : '';
}

/** LLM providers cycled by E4 */
export const OCTOPUS_LLM_PROVIDERS = ['anthropic', 'openai', 'google', 'ollama'] as const;
export type OctopusLLMProvider = typeof OCTOPUS_LLM_PROVIDERS[number];

export const PROVIDER_LABELS: Record<OctopusLLMProvider, string> = {
  anthropic: 'Claude',
  openai: 'GPT-4o',
  google: 'Gemini',
  ollama: 'Ollama (local)',
};
