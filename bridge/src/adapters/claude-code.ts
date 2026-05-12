/**
 * ClaudeCodeAdapter stub.
 * Full implementation lives in the AgentDeck monorepo (puritysb/AgentDeck).
 * This stub satisfies the import in adapters/index.ts so the bridge compiles.
 */
import { EventEmitter } from 'events';
import type { AgentAdapter, AgentCapabilities, AdapterStartOptions, PluginCommand } from '../types.js';

export class ClaudeCodeAdapter extends EventEmitter implements AgentAdapter {
  readonly capabilities: AgentCapabilities = {
    supportsInterrupt: true,
    supportsPermission: true,
    supportsModeSwitch: true,
    supportsVoiceInput: false,
    supportsMultipleOptions: true,
    agentType: 'claude-code',
  };

  async start(_options: AdapterStartOptions): Promise<void> {
    throw new Error('ClaudeCodeAdapter: full implementation requires AgentDeck monorepo');
  }

  async stop(): Promise<void> { /* no-op */ }

  handleCommand(_cmd: PluginCommand): void { /* no-op */ }
}
