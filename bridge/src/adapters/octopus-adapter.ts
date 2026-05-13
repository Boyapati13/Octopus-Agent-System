/**
 * OctopusAdapter
 * ──────────────
 * AgentDeck adapter for the Octopus Agent System (port 3001 / 5000).
 *
 * Follows the same AgentAdapter interface as ClaudeCodeAdapter / CodexCliAdapter
 * so it integrates transparently into the AgentDeck daemon multi-session model.
 *
 * Surface mapping:
 *   Stream Deck+  →  agent progress on LCD strip, gate pass/fail on key colors
 *   Android/Apple →  live agent chain timeline card
 *   TUI           →  animated agent swimlane view
 *   Pixoo64       →  octopus creature pulses per active agent
 *
 * State machine mapping:
 *   chain_start         → State.RUNNING  (spinner_start)
 *   agent_start         → State.RUNNING  (tool_action with agent name)
 *   gate_fail           → State.PERMISSION_PROMPT (approval needed)
 *   chain_done (ok)     → State.IDLE
 *   chain_done (fail)   → State.ERROR
 *   disconnected        → State.DISCONNECTED
 */

import { EventEmitter } from 'events';
import type {
  AgentAdapter,
  AgentCapabilities,
  AdapterStartOptions,
  AdapterEvent,
  PluginCommand,
} from '../types.js';
import { debug } from '../logger.js';
import { OctopusClient } from '../octopus/octopus-client.js';
import type { OctopusEvent, OctopusPlan } from '../octopus/octopus-client.js';

// ── Capabilities ──────────────────────────────────────────────────────────────

export const OCTOPUS_CAPABILITIES: AgentCapabilities = {
  supportsInterrupt: true,
  supportsPermission: false,   // gates are server-side; no interactive approval
  supportsModeSwitch: false,
  supportsVoiceInput: true,    // voice prompts routed to /api/tasks/voice
  supportsMultipleOptions: false,
  agentType: 'octopus' as import('../types.js').AgentType,
};

// ── Adapter ───────────────────────────────────────────────────────────────────

export class OctopusAdapter extends EventEmitter implements AgentAdapter {
  readonly capabilities: AgentCapabilities = OCTOPUS_CAPABILITIES;

  private client: OctopusClient;
  private currentPlan: OctopusPlan | null = null;
  private activeAgent: string | null = null;
  private chainRunning = false;

  constructor() {
    super();
    this.client = new OctopusClient();
  }

  // ── AgentAdapter lifecycle ────────────────────────────────────────────────

  async start(options: AdapterStartOptions): Promise<void> {
    debug('octopus:adapter', 'start()');

    const healthy = await this.client.isHealthy();
    if (!healthy) {
      this._emit({
        source: 'connection',
        event: 'disconnected',
        data: {
          reason: 'Octopus is not running',
          hint: 'Start with: cd octopus && ./start_mcp.sh  (Mac/Linux) or .\\start_mcp.ps1 (Windows)',
        },
      });
      throw new Error(
        'Octopus Agent System is not running on http://localhost:3001. ' +
        'Start it with:\n' +
        '  Mac/Linux: cd octopus && ./start_mcp.sh\n' +
        '  Windows:   cd octopus && .\\start_mcp.ps1\n' +
        'Then retry this session.'
      );
    }

    this.client.connect();
    this._wireClientEvents();
    this._emit({ source: 'connection', event: 'connected', data: {} });
  }

  async stop(): Promise<void> {
    debug('octopus:adapter', 'stop()');
    this.client.disconnect();
    this._emit({ source: 'connection', event: 'disconnected', data: {} });
  }

  handleCommand(cmd: PluginCommand): void {
    debug('octopus:adapter', `cmd: ${cmd.type}`);
    switch (cmd.type) {
      case 'interrupt':
        this._handleInterrupt();
        break;
      case 'send_prompt':
        if ('text' in cmd && cmd.text) {
          // 'voice' source routes to /api/tasks/voice for TTS-friendly response
          const isVoice = cmd.source === 'voice';
          this._handleSendPrompt(cmd.text, isVoice ? 'voice' : 'text');
        }
        break;
      default:
        debug('octopus:adapter', `unhandled cmd: ${cmd.type}`);
    }
  }

  // ── Private: command handlers ─────────────────────────────────────────────

  private async _handleInterrupt(): Promise<void> {
    debug('octopus:adapter', 'interrupt → stop chain');
    await this.client.interruptChain();
    this.chainRunning = false;
    this.activeAgent = null;
    this._emit({ source: 'parser', event: 'idle', data: {} });
  }

  private async _handleSendPrompt(text: string, source: 'text' | 'voice' = 'text'): Promise<void> {
    if (this.chainRunning) {
      debug('octopus:adapter', 'chain already running — ignoring prompt');
      this._emit({
        source: 'parser',
        event: 'status_line',
        data: { text: '⚠ Chain already running. Press STOP to interrupt.' },
      });
      return;
    }

    if (source === 'voice') {
      // Voice path: POST /api/tasks/voice returns immediately and emits
      // voice_summary on WS — designed for TTS consumption.
      debug('octopus:adapter', `voice prompt: ${text}`);
      this._emit({
        source: 'parser',
        event: 'status_line',
        data: { text: `🎙 Voice: ${text}` },
      });
      const ok = await this.client.runVoiceTask(text);
      if (!ok) {
        this._emit({
          source: 'parser',
          event: 'status_line',
          data: { text: '⚠ Failed to start voice task' },
        });
      }
      return;
    }

    // Text path: plan first (shows agent chain in UI), then run
    debug('octopus:adapter', `planning: ${text}`);
    const plan = await this.client.planTask(text);
    if (plan) {
      this.currentPlan = plan;
      this._emit({
        source: 'parser',
        event: 'status_line',
        data: {
          text: `🐙 Plan [${plan.pattern}]: ${plan.agents.join(' → ')}`,
        },
      });
    }

    const ok = await this.client.runTaskChain(text);
    if (!ok) {
      this._emit({
        source: 'parser',
        event: 'idle',
        data: { error: 'Failed to start Octopus task chain' },
      });
    }
  }

  // ── Private: event wiring ─────────────────────────────────────────────────

  private _wireClientEvents(): void {
    this.client.on('event', (ev: OctopusEvent) => this._handleOctopusEvent(ev));
    this.client.on('disconnected', () => {
      this._emit({ source: 'connection', event: 'disconnected', data: {} });
    });
    this.client.on('connected', () => {
      this._emit({ source: 'connection', event: 'connected', data: {} });
    });
  }

  private _handleOctopusEvent(ev: OctopusEvent): void {
    debug('octopus:adapter', `event: ${ev.type}`);

    switch (ev.type) {
      case 'chain_start': {
        this.chainRunning = true;
        this._emit({ source: 'parser', event: 'spinner_start', data: {} });
        this._emit({
          source: 'parser',
          event: 'status_line',
          data: { text: `🐙 Starting: ${ev.data.task}` },
        });
        if (ev.data.plan) {
          this._emit({
            source: 'parser',
            event: 'status_line',
            data: { text: `Chain: ${ev.data.plan.join(' → ')}` },
          });
        }
        break;
      }

      case 'agent_start': {
        this.activeAgent = ev.data.agent;
        this._emit({
          source: 'parser',
          event: 'tool_action',
          data: {
            tool: ev.data.agent,
            input: ev.data.role,
            is_octopus_agent: true,
          },
        });
        this._emit({
          source: 'parser',
          event: 'status_line',
          data: { text: `[${ev.data.agent}] ${ev.data.role}` },
        });
        break;
      }

      case 'agent_done': {
        const icon = ev.data.approved ? '✅' : '⛔';
        this._emit({
          source: 'parser',
          event: 'status_line',
          data: {
            text: `${icon} ${ev.data.agent}: ${ev.data.notes?.join('; ') ?? 'done'}`,
          },
        });
        break;
      }

      case 'gate_fail': {
        // Map gate failures → permission_prompt so Stream Deck+ shows
        // a dismissable alert (red key glow)
        this._emit({
          source: 'parser',
          event: 'permission_prompt',
          data: {
            tool: ev.data.agent,
            description: `Gate failed: ${ev.data.reason}`,
            options: ['Acknowledge'],
          },
        });
        break;
      }

      case 'tool_call': {
        this._emit({
          source: 'parser',
          event: 'tool_action',
          data: { tool: ev.data.tool, input: JSON.stringify(ev.data.args ?? {}) },
        });
        break;
      }

      case 'compaction': {
        this._emit({
          source: 'metadata',
          event: 'status_line',
          data: { text: `🗜 Compacting context (${ev.data.session_tool_calls} tool calls)` },
        });
        break;
      }

      case 'instinct_new': {
        this._emit({
          source: 'metadata',
          event: 'status_line',
          data: {
            text: `🧠 Instinct learned (conf ${ev.data.confidence.toFixed(2)}): ${ev.data.pattern}`,
          },
        });
        break;
      }

      case 'chain_done': {
        this.chainRunning = false;
        this.activeAgent = null;
        this._emit({ source: 'parser', event: 'spinner_stop', data: {} });
        if (ev.data.success) {
          this._emit({
            source: 'parser',
            event: 'status_line',
            data: { text: `✅ Done in ${((ev.data.duration_ms ?? 0) / 1000).toFixed(1)}s` },
          });
          this._emit({ source: 'parser', event: 'idle', data: {} });
        } else {
          this._emit({
            source: 'parser',
            event: 'status_line',
            data: { text: '⛔ Chain failed — see logs' },
          });
        }
        break;
      }

      case 'voice_summary': {
        // Surface the TTS-ready summary on all connected displays
        this._emit({
          source: 'metadata',
          event: 'status_line',
          data: {
            text: `🎙 ${ev.data.summary}`,
            tts: true,
            success: ev.data.success,
          },
        });
        break;
      }

      case 'connected':
        this._emit({ source: 'connection', event: 'connected', data: {} });
        break;

      case 'disconnected':
        this._emit({ source: 'connection', event: 'disconnected', data: {} });
        break;
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private _emit(ev: AdapterEvent): void {
    this.emit('adapter_event', ev);
  }

  // ── Convenience accessors (used by daemon for UI rendering) ───────────────

  get isChainRunning(): boolean {
    return this.chainRunning;
  }

  get currentAgentName(): string | null {
    return this.activeAgent;
  }

  get lastPlan(): OctopusPlan | null {
    return this.currentPlan;
  }
}
