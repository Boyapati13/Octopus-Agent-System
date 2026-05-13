/**
 * Bridge type definitions.
 * These are the minimal interfaces the Octopus adapter needs.
 * The full AgentDeck bridge (puritysb/AgentDeck) extends these significantly.
 */

import { EventEmitter } from 'events';

/** All supported agent types in AgentDeck. */
export type AgentType =
  | 'claude-code'
  | 'codex-cli'
  | 'openclaw'
  | 'opencode'
  | 'monitor'
  | 'octopus';

/** What an adapter can do. */
export interface AgentCapabilities {
  supportsInterrupt: boolean;
  supportsPermission: boolean;
  supportsModeSwitch: boolean;
  supportsVoiceInput: boolean;
  supportsMultipleOptions: boolean;
  agentType: AgentType;
}

/** Options passed to AgentAdapter.start(). */
export interface AdapterStartOptions {
  workingDirectory?: string;
  sessionId?: string;
  [key: string]: unknown;
}

/** Events emitted by an adapter — consumed by AgentDeck's StateMachine. */
export interface AdapterEvent {
  source: 'parser' | 'connection' | 'metadata';
  event:
    | 'spinner_start'
    | 'spinner_stop'
    | 'tool_action'
    | 'status_line'
    | 'permission_prompt'
    | 'idle'
    | 'connected'
    | 'disconnected';
  data: Record<string, unknown>;
}

/** Commands sent from surfaces → adapter. */
export interface PluginCommand {
  type: 'send_prompt' | 'interrupt' | 'permission_response' | 'mode_switch';
  text?: string;
  source?: 'text' | 'voice';
  response?: string;
  mode?: string;
}

/** The interface every AgentDeck adapter must implement. */
export interface AgentAdapter extends EventEmitter {
  readonly capabilities: AgentCapabilities;
  start(options: AdapterStartOptions): Promise<void>;
  stop(): Promise<void>;
  handleCommand(cmd: PluginCommand): void;
}
