/**
 * OctopusClient
 * ─────────────
 * HTTP + WebSocket client that connects AgentDeck Bridge to the
 * Octopus Agent System REST API (port 3001) and its event stream.
 *
 * Octopus REST API endpoints used:
 *   POST /api/tasks/plan        → octopus_plan_task
 *   POST /api/tasks/run         → octopus_run_task_chain
 *   GET  /api/health            → liveness check
 *   GET  /api/agents            → list active agents
 *   GET  /api/memory/search     → octopus_search_memory
 *   GET  /instincts             → instincts list (Python service :5000)
 *   POST /api/tasks/interrupt   → stop running chain
 *
 * Events streamed back via WebSocket (/ws):
 *   agent_start   { agent, role }
 *   agent_done    { agent, approved, notes }
 *   chain_start   { task, plan }
 *   chain_done    { task, success, duration_ms }
 *   gate_fail     { agent, reason }
 *   tool_call     { tool, args }
 *   compaction    { session_tool_calls }
 *   instinct_new  { pattern, confidence }
 */

import { EventEmitter } from 'events';
import { debug } from '../logger.js';

export const OCTOPUS_HTTP_PORT = 3001;
export const OCTOPUS_MEMORY_PORT = 5000;

export interface OctopusPlan {
  task: string;
  agents: string[];
  pattern: 'default' | 'tdd-first' | 'security-first' | 'research-first';
}

export interface OctopusAgentEvent {
  agent: string;
  role: string;
  approved?: boolean;
  notes?: string[];
}

export interface OctopusChainEvent {
  task: string;
  plan?: string[];
  success?: boolean;
  duration_ms?: number;
}

export interface OctopusGateFail {
  agent: string;
  reason: string;
}

export interface OctopusInstinct {
  id: string;
  pattern: string;
  confidence: number;
  occurrences: number;
}

export type OctopusEvent =
  | { type: 'agent_start'; data: OctopusAgentEvent }
  | { type: 'agent_done'; data: OctopusAgentEvent }
  | { type: 'chain_start'; data: OctopusChainEvent }
  | { type: 'chain_done'; data: OctopusChainEvent }
  | { type: 'gate_fail'; data: OctopusGateFail }
  | { type: 'tool_call'; data: { tool: string; args?: Record<string, unknown> } }
  | { type: 'compaction'; data: { session_tool_calls: number } }
  | { type: 'instinct_new'; data: OctopusInstinct }
  | { type: 'connected' }
  | { type: 'disconnected' };

export interface OctopusClientEvents {
  event: (ev: OctopusEvent) => void;
  connected: () => void;
  disconnected: () => void;
  error: (err: Error) => void;
}

declare interface OctopusClient {
  on<K extends keyof OctopusClientEvents>(event: K, listener: OctopusClientEvents[K]): this;
  emit<K extends keyof OctopusClientEvents>(event: K, ...args: Parameters<OctopusClientEvents[K]>): boolean;
}

/**
 * Lightweight HTTP client for Octopus REST API.
 * WebSocket event streaming is handled via native ws.
 */
class OctopusClient extends EventEmitter {
  private baseUrl: string;
  private memoryUrl: string;
  private ws: import('ws').WebSocket | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(host = '127.0.0.1') {
    super();
    this.baseUrl = `http://${host}:${OCTOPUS_HTTP_PORT}`;
    this.memoryUrl = `http://${host}:${OCTOPUS_MEMORY_PORT}`;
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  connect(): void {
    this.running = true;
    this._connectWs();
  }

  disconnect(): void {
    this.running = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
  }

  // ── Health ─────────────────────────────────────────────────────────────────

  async isHealthy(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/api/health`, { signal: AbortSignal.timeout(2000) });
      return res.ok;
    } catch {
      return false;
    }
  }

  // ── Task operations ────────────────────────────────────────────────────────

  async planTask(task: string): Promise<OctopusPlan | null> {
    try {
      const res = await fetch(`${this.baseUrl}/api/tasks/plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task }),
      });
      if (!res.ok) return null;
      return (await res.json()) as OctopusPlan;
    } catch (err) {
      debug('octopus:client', `planTask error: ${err}`);
      return null;
    }
  }

  async runTaskChain(task: string): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/api/tasks/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task }),
      });
      return res.ok;
    } catch (err) {
      debug('octopus:client', `runTaskChain error: ${err}`);
      return false;
    }
  }

  async interruptChain(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/api/tasks/interrupt`, { method: 'POST' });
      return res.ok;
    } catch {
      return false;
    }
  }

  // ── Memory & agents ────────────────────────────────────────────────────────

  async listAgents(): Promise<Array<{ name: string; role: string; canApprove: boolean }>> {
    try {
      const res = await fetch(`${this.baseUrl}/api/agents`);
      if (!res.ok) return [];
      return (await res.json()) as Array<{ name: string; role: string; canApprove: boolean }>;
    } catch {
      return [];
    }
  }

  async searchMemory(query: string): Promise<string[]> {
    try {
      const res = await fetch(`${this.baseUrl}/api/memory/search?q=${encodeURIComponent(query)}`);
      if (!res.ok) return [];
      const data = (await res.json()) as { results: string[] };
      return data.results ?? [];
    } catch {
      return [];
    }
  }

  async listInstincts(): Promise<OctopusInstinct[]> {
    try {
      const res = await fetch(`${this.memoryUrl}/instincts`);
      if (!res.ok) return [];
      return (await res.json()) as OctopusInstinct[];
    } catch {
      return [];
    }
  }

  async scanSecurity(target: string): Promise<{ findings: string[]; critical: number }> {
    try {
      const res = await fetch(`${this.baseUrl}/api/security/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target }),
      });
      if (!res.ok) return { findings: [], critical: 0 };
      return (await res.json()) as { findings: string[]; critical: number };
    } catch {
      return { findings: [], critical: 0 };
    }
  }

  // ── WebSocket event stream ─────────────────────────────────────────────────

  private _connectWs(): void {
    if (!this.running) return;

    const wsUrl = `ws://127.0.0.1:${OCTOPUS_HTTP_PORT}/ws`;
    debug('octopus:client', `connecting WS → ${wsUrl}`);

    // Dynamic import to avoid hard dependency on ws when octopus is not running
    import('ws').then(({ default: WS }) => {
      const ws = new WS(wsUrl);
      this.ws = ws;

      ws.on('open', () => {
        debug('octopus:client', 'WS connected');
        this.emit('connected');
        this.emit('event', { type: 'connected' } as OctopusEvent);
      });

      ws.on('message', (raw: Buffer) => {
        try {
          const ev = JSON.parse(raw.toString()) as OctopusEvent;
          this.emit('event', ev);
        } catch {
          // malformed frame — ignore
        }
      });

      ws.on('close', () => {
        debug('octopus:client', 'WS disconnected');
        this.emit('disconnected');
        this.emit('event', { type: 'disconnected' } as OctopusEvent);
        this._scheduleReconnect();
      });

      ws.on('error', (err: Error) => {
        debug('octopus:client', `WS error: ${err.message}`);
        this.emit('error', err);
        ws.terminate();
      });
    }).catch((err) => {
      debug('octopus:client', `ws import failed (ws not installed?): ${err}`);
      this._scheduleReconnect();
    });
  }

  private _scheduleReconnect(): void {
    if (!this.running || this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this._connectWs();
    }, 5000);
  }
}

export { OctopusClient };
