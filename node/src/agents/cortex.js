'use strict';
/**
 * Cortex — Planner
 * Determines which agents to run for a given task.
 *
 * Planning order (highest to lowest priority):
 *   1. LLM-backed: asks the active LLM to pick from the live agent registry
 *      — works with dynamically created agents, adapts to any task type
 *   2. Keyword fallback: regex-based routing when LLM is unavailable
 */
const { loadSkills } = require('../skills');
const { complete }   = require('../llm');

const name = 'Cortex';
const role = 'planner';
const canApprove = true;

const REQUIRED_SKILLS = ['get_run_state', 'writeback'];

// ── Keyword fallback (used when LLM call fails) ───────────────────────────────

const KEYWORD_ROUTES = [
  { re: /skill|evolve|marketplace|scout|toolsmith|synthesize|new.?tool|market/i,
    agents: ['MarketScout','Toolsmith','SandboxQA','Scribe'] },
  { re: /browse|navigate|scrape|website|webpage|https?:|url|visit|web.?research/i,
    agents: ['Navigator','Atlas','FactChecker','Scribe'] },
  { re: /audit|security|vuln|owasp|cve|penetration/i,
    agents: ['Atlas','SecurityReviewer','Scribe'] },
  { re: /doc|readme|comment|jsdoc|changelog/i,
    agents: ['Atlas','Forge','Reviewer','Scribe'] },
  { re: /release|deploy|publish|version|tag/i,
    agents: ['ReleaseKeeper'] },
  { re: /test|spec|coverage|jest|pytest|unit/i,
    agents: ['Atlas','Probe','Forge','Scribe'] },
  { re: /perf|optim|speed|latency|benchmark/i,
    agents: ['Atlas','Architect','Forge','Reviewer','Scribe'] },
  { re: /refactor|clean|lint|format|style/i,
    agents: ['Atlas','Forge','Reviewer','Scribe'] },
];

const DEFAULT_CHAIN = ['Atlas','Architect','Forge','FactChecker','Reviewer','SecurityReviewer','Probe','Scribe','ReleaseKeeper'];

function keywordFallback(taskStr) {
  for (const { re, agents } of KEYWORD_ROUTES) {
    if (re.test(taskStr)) return agents;
  }
  return DEFAULT_CHAIN;
}

// ── LLM-backed planning ───────────────────────────────────────────────────────

async function llmPlan(taskStr, available) {
  if (!available.length) throw new Error('No agents registered');

  const agentList = available
    .map(a => `- ${a.name} (${a.role})${a.canApprove ? ' [GATE: stops chain on failure]' : ''}`)
    .join('\n');

  const prompt = `You are Cortex, the planner in the Octopus multi-agent AI system.
Select the minimal ordered set of agents needed for this specific task.

Available agents:
${agentList}

Task: "${taskStr}"

Rules:
- Only include agents genuinely needed for THIS task
- Order: research → implement → verify → document → release
- GATE agents stop the pipeline if they fail — include when verification is critical
- Lean plans preferred: 2-4 agents for simple tasks, up to 9 for full release cycles
- Return ONLY a valid JSON array of agent names — no explanation, no markdown

JSON array:`;

  const out = await complete(prompt, { maxTokens: 200, timeout: 15000 });
  const match = out.match(/\[[\s\S]*?\]/);
  if (!match) throw new Error('No JSON array in LLM output');

  const arr = JSON.parse(match[0]);
  if (!Array.isArray(arr) || !arr.length) throw new Error('Empty plan array');

  // Only include names that exist in the registry
  const validNames = new Set(available.map(a => a.name.toLowerCase()));
  const valid = arr.filter(n => typeof n === 'string' && validNames.has(n.toLowerCase()));
  if (!valid.length) throw new Error('No valid agent names in LLM plan');

  return valid;
}

// ── Core planning entry point ─────────────────────────────────────────────────

async function determineAgents(taskStr) {
  // Lazy-require agents/index to avoid circular dep at module load time.
  // By the time this function is called, all modules are fully initialised.
  let available = [];
  try {
    const { listAgents } = require('./index');
    available = listAgents();
  } catch {}

  // 1. Try LLM-backed planning
  if (available.length) {
    try {
      const names = await llmPlan(taskStr, available);
      return names.map(agent => ({ agent, reason: 'llm-selected' }));
    } catch (err) {
      console.warn(`[cortex] LLM planning failed (${err.message}) — using keyword fallback`);
    }
  }

  // 2. Keyword fallback
  return keywordFallback(taskStr).map(agent => ({ agent, reason: 'keyword-matched' }));
}

// ── Agent run function ────────────────────────────────────────────────────────

async function run(input, memory) {
  const { task } = input;
  const skills   = await loadSkills(REQUIRED_SKILLS, memory);
  const runState = await skills.get_run_state() || {};

  const agentPlan = await determineAgents(task);
  const approvals = (runState.approvals || []).map(a => a.agent.toLowerCase());

  const steps = agentPlan.map((s, i) => ({
    step:   i + 1,
    agent:  s.agent,
    reason: s.reason,
    status: approvals.includes(s.agent.toLowerCase()) ? 'approved' : 'pending',
  }));

  await skills.writeback(name, {
    run_patch: { task, status: 'planned', notes: [`Cortex planned ${steps.length} steps`] },
  });

  return {
    agent:   name,
    role,
    task,
    plan:    steps,
    blockers: runState.blockers || [],
    advice:  `Planned ${steps.length} steps via ${agentPlan[0]?.reason === 'llm-selected' ? 'LLM' : 'keyword'} routing.`,
  };
}

module.exports = { name, role, canApprove, run };
