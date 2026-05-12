/**
 * CodexCliAdapter stub — full implementation in AgentDeck monorepo.
 */
import { EventEmitter } from 'events';
import type { AgentAdapter, AgentCapabilities, AdapterStartOptions, PluginCommand } from '../types.js';

export class CodexCliAdapter extends EventEmitter implements AgentAdapter {
  readonly capabilities: AgentCapabilities = {
    supportsInterrupt: true, supportsPermission: false, supportsModeSwitch: false,
    supportsVoiceInput: false, supportsMultipleOptions: false, agentType: 'codex-cli',
  };
  async start(_o: AdapterStartOptions): Promise<void> { throw new Error('stub'); }
  async stop(): Promise<void> { /* no-op */ }
  handleCommand(_c: PluginCommand): void { /* no-op */ }
}
