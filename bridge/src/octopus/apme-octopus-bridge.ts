/**
 * apme-octopus-bridge.ts
 * ──────────────────────
 * Connects AgentDeck's APME (Agent Performance Evaluation) module to
 * Octopus Agent System's Continuous Learning v2 (Instincts).
 *
 * Data flow:
 *   APME session eval → extract high-signal patterns → POST /instincts
 *
 * This creates a bidirectional learning loop:
 *   • Octopus agents produce code / decisions → AgentDeck captures PTY output
 *   • APME evaluates quality (rubrics, category scores, composite)
 *   • Bridge extracts instinct candidates from low-scoring categories
 *   • Candidates posted to Octopus /instincts → confidence accumulates
 *   • High-confidence instincts (≥0.8) graduate to active skills
 *
 * Example instinct extracted from APME:
 *   APME category "test_coverage" score: 0.4 / 1.0
 *   → Instinct: "Always run Probe before Forge for test-driven tasks"
 *   → confidence: 0.55, occurrences: 1
 *
 * This file is optional — AgentDeck and Octopus work independently without it.
 * Enable by importing and calling `startApmeBridge()` in daemon.ts.
 */

import { debug } from '../logger.js';
import { OCTOPUS_MEMORY_PORT } from './octopus-client.js';

// ── Types (mirrors APME eval schema) ─────────────────────────────────────────

export interface ApmeSessionResult {
  sessionId: string;
  agentType: string;
  compositeScore: number;  // 0.0 – 1.0
  categories: Record<string, number>;  // e.g. { test_coverage: 0.4, security: 0.9 }
  turns: number;
  timestamp: number;
}

export interface ExtractedInstinct {
  pattern: string;
  confidence: number;
  source: 'apme';
  apme_session_id: string;
  apme_category: string;
  apme_score: number;
}

// ── Pattern templates keyed by APME category ──────────────────────────────────

const CATEGORY_INSTINCTS: Record<string, (score: number) => string | null> = {
  test_coverage: (s) =>
    s < 0.5
      ? 'Run Probe before Forge for all feature tasks (TDD-first pattern improves test coverage)'
      : null,
  security: (s) =>
    s < 0.6
      ? 'Route all auth/payment/secret tasks through SecurityReviewer first (security-first pattern)'
      : null,
  factual_accuracy: (s) =>
    s < 0.6
      ? 'Prepend FactChecker to research tasks before any implementation (research-first pattern)'
      : null,
  code_quality: (s) =>
    s < 0.5
      ? 'Always include Reviewer in the agent chain; never skip code quality gate'
      : null,
  documentation: (s) =>
    s < 0.5
      ? 'Include Scribe at end of every task chain to maintain documentation and changelog'
      : null,
  architecture: (s) =>
    s < 0.6
      ? 'Route refactoring and structural changes through Architect before Forge'
      : null,
  performance: (s) =>
    s < 0.5
      ? 'Use Promise.allSettled for parallel QA gates; avoid sequential gate execution'
      : null,
};

// ── Bridge ────────────────────────────────────────────────────────────────────

export class ApmOctopusBridge {
  private memoryUrl = `http://127.0.0.1:${OCTOPUS_MEMORY_PORT}`;
  private enabled = false;

  /** Call once to activate the bridge. No-ops if Octopus memory is unreachable. */
  async start(): Promise<void> {
    try {
      const res = await fetch(`${this.memoryUrl}/health`, { signal: AbortSignal.timeout(2000) });
      this.enabled = res.ok;
      debug('apme:octopus', `bridge ${this.enabled ? 'enabled' : 'disabled (memory unreachable)'}`);
    } catch {
      this.enabled = false;
      debug('apme:octopus', 'bridge disabled (memory service not running)');
    }
  }

  stop(): void {
    this.enabled = false;
  }

  /**
   * Called after each APME session evaluation.
   * Extracts instinct candidates from low-scoring categories and posts them
   * to the Octopus memory service.
   */
  async onSessionEval(result: ApmeSessionResult): Promise<void> {
    if (!this.enabled) return;

    const instincts = this._extractInstincts(result);
    if (instincts.length === 0) return;

    debug('apme:octopus', `posting ${instincts.length} instinct(s) from session ${result.sessionId}`);

    for (const instinct of instincts) {
      await this._postInstinct(instinct);
    }
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private _extractInstincts(result: ApmeSessionResult): ExtractedInstinct[] {
    const out: ExtractedInstinct[] = [];

    for (const [category, score] of Object.entries(result.categories)) {
      const template = CATEGORY_INSTINCTS[category];
      if (!template) continue;

      const pattern = template(score);
      if (!pattern) continue;

      // Confidence is inversely proportional to the score deficit
      // (worse score → stronger signal → higher confidence in instinct)
      const deficit = 1 - score;
      const confidence = Math.min(0.5 + deficit * 0.4, 0.85);

      out.push({
        pattern,
        confidence,
        source: 'apme',
        apme_session_id: result.sessionId,
        apme_category: category,
        apme_score: score,
      });
    }

    return out;
  }

  private async _postInstinct(instinct: ExtractedInstinct): Promise<void> {
    try {
      const res = await fetch(`${this.memoryUrl}/instincts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(instinct),
        signal: AbortSignal.timeout(3000),
      });
      if (!res.ok) {
        debug('apme:octopus', `POST /instincts failed: ${res.status}`);
      }
    } catch (err) {
      debug('apme:octopus', `POST /instincts error: ${err}`);
    }
  }
}

// Singleton — import and call start() once in daemon.ts
export const apmOctopusBridge = new ApmOctopusBridge();
