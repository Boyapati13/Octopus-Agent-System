'use strict';
/**
 * task_router.js — Multi-Model Task Router
 *
 * Routes each Octopus agent role to the best specialised model.
 *
 * Model tiers used:
 *   NVIDIA NIM    — Free trial at build.nvidia.com (OpenAI-compatible)
 *                   Set NVIDIA_API_KEY in node/.env
 *   OpenRouter    — 200+ models incl. Hermes-3/4, $0 free credits
 *                   Set OPENROUTER_API_KEY in node/.env
 *   Ollama (local)— Always-on sovereign fallback, no key needed
 *                   Install at ollama.com
 *
 * Best NVIDIA NIM models per specialty (2025-05):
 *   Planning/Reasoning : nvidia/llama-3.1-nemotron-ultra-253b-v1      (SOTA reasoning)
 *   Coding             : qwen/qwen3-coder-480b-a35b-instruct           (best coder on NIM)
 *   Fast coding        : deepseek-ai/deepseek-v4-pro                   (1M ctx, speed+quality)
 *   Research           : meta/llama-4-maverick-17b-128e-instruct       (128-expert MoE)
 *   Agentic/tool-use   : nousresearch/hermes-3-llama-3.1-405b          (Hermes via OpenRouter)
 *   Web search         : upstage/solar-pro-preview-with-search         (built-in search)
 *   Vision/Documents   : nvidia/nemotron-3-nano-omni-9b                (omni-modal)
 *   Security           : meta/llama-3.3-70b-instruct                   (broad OWASP knowledge)
 *   Verification       : microsoft/phi-4-128k-instruct                 (precise, 128K ctx)
 *
 * Override any route via env var: ROUTE_<ROLE>=<provider>:<model>
 *   e.g. ROUTE_planner=openrouter:nousresearch/hermes-4-405b
 *        ROUTE_implementation=nvidia:qwen/qwen3-coder-480b-a35b-instruct
 *
 * Agent roles come from each agent's `role` export in node/src/agents/*.js
 */

const DEFAULT_ROUTES = {
  // ── Planning & Reasoning ──────────────────────────────────────────────────
  // Nemotron Ultra 253B: NVIDIA's best reasoning model (beats GPT-4o on benchmarks)
  planner: {
    provider:    'nvidia',
    model:       'nvidia/llama-3.1-nemotron-ultra-253b-v1',
    description: 'Nemotron Ultra 253B — NVIDIA SOTA reasoning + planning, free NIM trial',
    agents:      ['cortex'],
  },

  // ── Architecture & Design ─────────────────────────────────────────────────
  // Kimi K2 Thinking: excellent for multi-step architectural reasoning
  architecture: {
    provider:    'nvidia',
    model:       'moonshotai/kimi-k2-thinking',
    description: 'Kimi K2 Thinking — deep chain-of-thought for system design',
    agents:      ['architect'],
  },

  // ── Coding & Implementation ───────────────────────────────────────────────
  // Qwen3-Coder 480B: purpose-built coder, 480B params, top coding benchmarks
  implementation: {
    provider:    'nvidia',
    model:       'qwen/qwen3-coder-480b-a35b-instruct',
    description: 'Qwen3-Coder 480B — purpose-built coding model, top SWE-bench score',
    agents:      ['forge'],
  },

  // ── Code Review ───────────────────────────────────────────────────────────
  // DeepSeek V4 Pro: 1M token context — can load whole codebases
  review: {
    provider:    'nvidia',
    model:       'deepseek-ai/deepseek-v4-pro',
    description: 'DeepSeek V4 Pro — 1M token context, deep whole-codebase review',
    agents:      ['reviewer'],
  },

  // ── Testing & TDD ─────────────────────────────────────────────────────────
  testing: {
    provider:    'nvidia',
    model:       'deepseek-ai/deepseek-v4-pro',
    description: 'DeepSeek V4 Pro — strong test generation, TDD, and coverage analysis',
    agents:      ['probe', 'sandbox-validation'],
  },

  // ── Security Analysis ─────────────────────────────────────────────────────
  security: {
    provider:    'nvidia',
    model:       'meta/llama-3.3-70b-instruct',
    description: 'Llama 3.3 70B — broad OWASP knowledge, security pattern analysis',
    agents:      ['securityreviewer'],
  },

  // ── Fact Verification ─────────────────────────────────────────────────────
  // Phi-4 128K: precise, compact, great for grounding and fact-checking
  verification: {
    provider:    'nvidia',
    model:       'microsoft/phi-4-128k-instruct',
    description: 'Phi-4 128K — precise reasoning for grounding and fact verification',
    agents:      ['factchecker'],
  },

  // ── Documentation & Writing ───────────────────────────────────────────────
  documentation: {
    provider:    'huggingface',
    model:       'google/gemma-3-4b-it',
    description: 'Gemma 3 4B (HuggingFace free) — clean, fast writing for docs',
    agents:      ['scribe'],
  },

  // ── Research & Web Intelligence ───────────────────────────────────────────
  // Llama 4 Maverick: 128-expert MoE — broad world knowledge + fast inference
  research: {
    provider:    'nvidia',
    model:       'meta/llama-4-maverick-17b-128e-instruct',
    description: 'Llama 4 Maverick 128E — 128-expert MoE, wide knowledge for research',
    agents:      ['marketscout', 'navigator'],
  },

  // ── Web Search (solar has built-in search tool) ───────────────────────────
  'web-search': {
    provider:    'nvidia',
    model:       'upstage/solar-pro-preview-with-search',
    description: 'Solar Pro + Search — built-in web search, no separate tool needed',
    agents:      [],
  },

  // ── Agentic / Tool-use Tasks (Hermes specialty) ───────────────────────────
  // Hermes-3: NousResearch's agentic model, best-in-class for tool calling
  agentic: {
    provider:    'openrouter',
    model:       'nousresearch/hermes-3-llama-3.1-405b',
    description: 'Hermes-3 405B (OpenRouter) — SOTA agentic tool-use, function calling',
    agents:      [],
  },

  // ── Document Analysis & Vision ────────────────────────────────────────────
  // Nemotron Omni: vision + text, for document images/screenshots
  'document-analysis': {
    provider:    'nvidia',
    model:       'nvidia/nemotron-3-nano-omni-9b',
    description: 'Nemotron Omni 9B — multi-modal, vision+text for document analysis',
    agents:      [],
  },

  // ── Skill Scouting ───────────────────────────────────────────────────────
  'skill-scouting': {
    provider:    'nvidia',
    model:       'meta/llama-4-maverick-17b-128e-instruct',
    description: 'Llama 4 Maverick — broad knowledge for market and skill research',
    agents:      ['marketscout'],
  },

  // ── Skill Synthesis (code generation) ────────────────────────────────────
  'skill-synthesis': {
    provider:    'nvidia',
    model:       'qwen/qwen3-coder-480b-a35b-instruct',
    description: 'Qwen3-Coder 480B — synthesising new MCP skills from API docs',
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
    description: 'Gemma 4 local — continuous memory ops, zero cloud latency',
    agents:      ['atlas'],
  },

  // ── Browser Automation ────────────────────────────────────────────────────
  browser: {
    provider:    'ollama',
    model:       'gemma4:e2b',
    description: 'Gemma 4 local — fast, continuous browser control tasks',
    agents:      ['navigator'],
  },

  // ── Finance & Business Analysis ───────────────────────────────────────────
  finance: {
    provider:    'nvidia',
    model:       'stockmark/stockmark-2-100b-instruct',
    description: 'Stockmark 100B — purpose-built financial domain specialist',
    agents:      ['finance'],
  },

  // ── Default / Sovereign Fallback ─────────────────────────────────────────
  default: {
    provider:    'ollama',
    model:       'gemma4:e2b',
    description: 'Gemma 4 local — sovereign fallback, always available, no key needed',
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
