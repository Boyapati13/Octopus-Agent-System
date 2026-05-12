'use strict';
/**
 * task_router.js — Smart Task Router
 *
 * Maps each Octopus agent role to the best free model for that specific task.
 * Gemma 4 (local Ollama) handles continuous/always-on operations.
 * Specialised cloud models (NVIDIA NIM, Hugging Face) handle heavy tasks.
 *
 * Used when LLM_PROVIDER=router in node/.env.
 * Individual routes can be overridden via env vars:
 *   ROUTE_planner=nvidia:moonshotai/kimi-k2-thinking
 *   ROUTE_implementation=nvidia:qwen/qwen2.5-coder-32b-instruct
 *   ROUTE_finance=nvidia:stockmark/stockmark-2-100b-instruct
 *
 * Agent roles come from each agent's `role` export in node/src/agents/*.js
 */

const DEFAULT_ROUTES = {
  // ── Planning & Reasoning ──────────────────────────────────────────────────
  planner: {
    provider:    'nvidia',
    model:       'moonshotai/kimi-k2-thinking',
    description: 'Kimi K2 thinking — best free reasoning + planning model on NIM',
    agents:      ['cortex'],
  },

  // ── Architecture & Design ─────────────────────────────────────────────────
  architecture: {
    provider:    'nvidia',
    model:       'moonshotai/kimi-k2-thinking',
    description: 'Deep reasoning for system design and boundary impact analysis',
    agents:      ['architect'],
  },

  // ── Coding & Implementation ───────────────────────────────────────────────
  implementation: {
    provider:    'nvidia',
    model:       'deepseek-ai/deepseek-v4-pro',
    description: 'DeepSeek V4 Pro — 1M context, top-tier coding, free trial on NIM',
    agents:      ['forge'],
  },

  // ── Code Review ───────────────────────────────────────────────────────────
  review: {
    provider:    'nvidia',
    model:       'deepseek-ai/deepseek-v4-pro',
    description: 'DeepSeek V4 Pro — 1M context for deep whole-codebase review',
    agents:      ['reviewer'],
  },

  // ── Testing & TDD ─────────────────────────────────────────────────────────
  testing: {
    provider:    'nvidia',
    model:       'deepseek-ai/deepseek-v4-pro',
    description: 'DeepSeek V4 Pro — strong at test generation and TDD workflows',
    agents:      ['probe', 'sandbox-validation'],
  },

  // ── Security Analysis ─────────────────────────────────────────────────────
  security: {
    provider:    'nvidia',
    model:       'meta/llama-3.1-70b-instruct',
    description: 'Llama 3.1 70B — strong at OWASP pattern recognition + analysis',
    agents:      ['securityreviewer'],
  },

  // ── Fact Verification ─────────────────────────────────────────────────────
  verification: {
    provider:    'nvidia',
    model:       'microsoft/phi-4-mini-flash-reasoning',
    description: 'Phi-4 Mini Flash — fast, precise reasoning for grounding checks',
    agents:      ['factchecker'],
  },

  // ── Documentation & Writing ───────────────────────────────────────────────
  documentation: {
    provider:    'huggingface',
    model:       'google/gemma-3-4b-it',
    description: 'Gemma 3 4B — clean, fast writing for docs and changelogs',
    agents:      ['scribe'],
  },

  // ── Research & Skill Scouting ─────────────────────────────────────────────
  'skill-scouting': {
    provider:    'nvidia',
    model:       'meta/llama-3.1-70b-instruct',
    description: 'Llama 3.1 70B — broad knowledge for market and skill research',
    agents:      ['marketscout'],
  },

  // ── Skill Synthesis (code generation) ────────────────────────────────────
  'skill-synthesis': {
    provider:    'nvidia',
    model:       'deepseek-ai/deepseek-v4-pro',
    description: 'DeepSeek V4 Pro — synthesising new MCP skills from API docs',
    agents:      ['toolsmith'],
  },

  // ── Release Management ────────────────────────────────────────────────────
  release: {
    provider:    'ollama',
    model:       'gemma4:e2b',
    description: 'Gemma 4 local — lightweight release gate checks, always-on',
    agents:      ['releasekeeper'],
  },

  // ── Memory / Structural Search ────────────────────────────────────────────
  memory: {
    provider:    'ollama',
    model:       'gemma4:e2b',
    description: 'Gemma 4 local — continuous memory ops, no cloud latency',
    agents:      ['atlas'],
  },

  // ── Browser Automation ────────────────────────────────────────────────────
  browser: {
    provider:    'ollama',
    model:       'gemma4:e2b',
    description: 'Gemma 4 local — fast, continuous browser control tasks',
    agents:      ['navigator'],
  },

  // ── Finance & Business Analysis (custom tasks) ────────────────────────────
  finance: {
    provider:    'nvidia',
    model:       'stockmark/stockmark-2-100b-instruct',
    description: 'Stockmark 100B — purpose-built financial domain specialist',
    agents:      ['finance'],
  },

  // ── Default / Fallback ────────────────────────────────────────────────────
  default: {
    provider:    'ollama',
    model:       'gemma4:e2b',
    description: 'Gemma 4 local — Sovereign Fallback for any unrouted task',
    agents:      [],
  },
};

// Build a reverse map: agent name → route key
const AGENT_TO_ROUTE = {};
for (const [routeKey, route] of Object.entries(DEFAULT_ROUTES)) {
  for (const agent of route.agents) {
    AGENT_TO_ROUTE[agent.toLowerCase()] = routeKey;
  }
}

/**
 * Apply env var overrides. Format: ROUTE_<ROLE>=<provider>:<model>
 * Example: ROUTE_planner=huggingface:google/gemma-3-27b-it
 */
function buildRoutes() {
  const routes = { ...DEFAULT_ROUTES };
  for (const [key, val] of Object.entries(process.env)) {
    if (!key.startsWith('ROUTE_')) continue;
    const role = key.slice(6).toLowerCase();
    const idx  = val.indexOf(':');
    if (idx < 1) continue;
    const provider = val.slice(0, idx);
    const model    = val.slice(idx + 1);
    routes[role] = { ...routes[role], provider, model, overridden: true };
  }
  return routes;
}

const ROUTES = buildRoutes();

/**
 * Get route for a given agent role or task name.
 * Tries: direct role lookup → agent-name lookup → default
 */
function getRoute(roleOrAgent) {
  if (!roleOrAgent) return ROUTES.default;
  const key = (roleOrAgent || '').toLowerCase();
  return ROUTES[key]
      || ROUTES[AGENT_TO_ROUTE[key]]
      || ROUTES.default;
}

/**
 * Return a formatted summary of all active routes (for octopus_vault_check / diagnostics).
 */
function summarise() {
  return Object.entries(ROUTES)
    .filter(([k]) => k !== 'default')
    .map(([role, r]) => ({
      role,
      provider: r.provider,
      model:    r.model,
      agents:   r.agents,
      overridden: r.overridden || false,
      description: r.description,
    }));
}

module.exports = { getRoute, summarise, ROUTES, AGENT_TO_ROUTE };
