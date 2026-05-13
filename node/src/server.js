'use strict';
const http    = require('http');
const path    = require('path');
const os      = require('os');
const fs      = require('fs');
const { WebSocketServer } = require('ws');
const express = require('express');
const cors    = require('cors');
const memory  = require('./memory');
const { listAgents, runAgent, getAgent } = require('./agents');
const { runTask } = require('./runner');
const { complete, activeProvider } = require('./llm');
const { getTools, SUPPORTED_FORMATS } = require('./adapters');
const skillRegistry = require('./skill_registry');
const toolLoader    = require('./tool_loader');
const { search: webSearch, formatResults } = require('./tools/web_search');
const { processDocument } = require('./tools/document');
const { initGateways, manager: gatewayManager } = require('./gateways');
const { router: setupRouter, isSetupComplete, SETUP_HTML } = require('./setup-api');

// ── HEADLESS_MODE ────────────────────────────────────────────────────────────
// When true: Cortex does not auto-plan; external LLMs call octopus_* tools directly.
// Read at request time so tests and runtime toggling work without a restart.
const isHeadlessMode = () => process.env.HEADLESS_MODE === 'true';

const app  = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// ── WebSocket broadcast infrastructure ────────────────────────────────────────

const httpServer = http.createServer(app);
const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

const wsClients = new Set();

wss.on('connection', (ws) => {
  wsClients.add(ws);
  ws.send(JSON.stringify({ type: 'connected' }));
  ws.on('close', () => wsClients.delete(ws));
  ws.on('error', () => wsClients.delete(ws));
});

/**
 * Broadcast an Octopus event to all connected WebSocket clients.
 * Matches the OctopusEvent discriminated union in octopus-client.ts.
 */
function broadcastEvent(type, data = {}) {
  const msg = JSON.stringify({ type, data });
  for (const ws of wsClients) {
    try { ws.send(msg); } catch { wsClients.delete(ws); }
  }
}

// ── Multi-chain state ─────────────────────────────────────────────────────────
// Maps project_id → { task, startMs } so multiple projects can run chains in
// parallel. The single-lock model was the root cause of gateway task collisions.

const activeChains = new Map();   // project_id → { task: string, startMs: number }

// Legacy shim — kept so existing server.js interrupt route still compiles
let activeChainTask  = null;
let activeChainAbort = null;

function startChain(projectId, task) {
  activeChains.set(projectId, { task, startMs: Date.now() });
  activeChainTask = task;  // shim for interrupt route
}

function endChain(projectId) {
  activeChains.delete(projectId);
  if (activeChains.size === 0) activeChainTask = null;
}

function isChainRunning(projectId) {
  return projectId ? activeChains.has(projectId) : activeChains.size > 0;
}

// ── Gateway session registry ──────────────────────────────────────────────────
// Maps a stable session key ("telegram:123456") to a project_id.
// This ensures: same user on Telegram = same project = same WS stream on Dashboard.

const gatewaySessions = new Map();  // sessionKey → project_id

function getOrCreateGatewayProject(gateway, userId) {
  const key = `${gateway}:${userId}`;
  let projectId = gatewaySessions.get(key);
  if (projectId && projectStore.has(projectId)) return projectStore.get(projectId);
  // Create a named project for this gateway user
  const project = createProject(`${gateway}/${userId}`);
  gatewaySessions.set(key, project.id);
  return project;
}

// ── Project / session workspace state ────────────────────────────────────────

const DEFAULT_PROJECT_TITLE = 'Octo Workspace';
const projectStore = new Map();
let projectSequence = 1;
let activeProjectId = null;

function isoNow() {
  return new Date().toISOString();
}

function makeId(prefix) {
  return `${prefix}-${Date.now()}-${projectSequence++}`;
}

function cloneProject(project) {
  return JSON.parse(JSON.stringify(project));
}

function createProject(title = DEFAULT_PROJECT_TITLE) {
  const id = makeId('project');
  const project = {
    id,
    title: title.trim() || DEFAULT_PROJECT_TITLE,
    created_at: isoNow(),
    last_active: isoNow(),
    messages: [],
    answer: '',
    answer_status: 'idle',
    status: 'idle',
    browser_context: {
      url: '',
      title: '',
      last_action: 'Waiting for browser context',
      status: 'idle',
      recent_tabs: [],
    },
    artifacts: [],
    activity_feed: [],
    approvals: [],
    pinned_tools: ['Browser', 'Terminal', 'Memory', 'Voice'],
    active_mode: 'operator',
  };
  projectStore.set(id, project);
  if (!activeProjectId) activeProjectId = id;
  return project;
}

function getProject(projectId) {
  if (projectId && projectStore.has(projectId)) return projectStore.get(projectId);
  if (activeProjectId && projectStore.has(activeProjectId)) return projectStore.get(activeProjectId);
  if (!projectStore.size) return createProject();
  return projectStore.values().next().value;
}

function serializeProject(project) {
  return cloneProject(project);
}

function listProjects() {
  return [...projectStore.values()]
    .sort((a, b) => new Date(b.last_active).getTime() - new Date(a.last_active).getTime())
    .map(serializeProject);
}

function touchProject(project, patch = {}) {
  Object.assign(project, patch);
  project.last_active = isoNow();
  return project;
}

function appendProjectMessage(projectId, role, text, meta = {}) {
  const project = getProject(projectId);
  const message = {
    id: makeId('message'),
    role,
    text,
    meta,
    created_at: isoNow(),
  };
  project.messages.push(message);
  touchProject(project);
  return message;
}

function appendProjectActivity(projectId, type, payload = {}) {
  const project = getProject(projectId);
  const activity = {
    id: makeId('activity'),
    type,
    payload,
    created_at: isoNow(),
  };
  project.activity_feed.unshift(activity);
  project.activity_feed = project.activity_feed.slice(0, 200);
  touchProject(project);
  return activity;
}

function setProjectAnswer(projectId, text, status = 'idle') {
  const project = getProject(projectId);
  touchProject(project, { answer: text, answer_status: status });
  return project.answer;
}

function updateProjectBrowserContext(projectId, patch = {}) {
  const project = getProject(projectId);
  const nextContext = {
    ...project.browser_context,
    ...patch,
  };
  if (Array.isArray(nextContext.recent_tabs)) {
    nextContext.recent_tabs = nextContext.recent_tabs.slice(0, 8);
  }
  touchProject(project, { browser_context: nextContext });
  return project.browser_context;
}

function recordProjectEvent(projectId, type, payload = {}) {
  const project = getProject(projectId);
  const eventData = { ...payload, project_id: project.id };

  switch (type) {
    case 'chain_start':
      touchProject(project, { status: 'running' });
      appendProjectActivity(project.id, 'chain_start', eventData);
      break;
    case 'agent_start':
      appendProjectActivity(project.id, 'agent_start', eventData);
      break;
    case 'agent_done':
      appendProjectActivity(project.id, 'agent_done', eventData);
      break;
    case 'gate_fail':
      appendProjectActivity(project.id, 'gate_fail', eventData);
      project.approvals.unshift({
        id: makeId('approval'),
        type: 'gate_fail',
        agent: payload.agent || 'gate',
        reason: payload.reason || 'Blocked',
        status: 'blocked',
        created_at: isoNow(),
      });
      project.approvals = project.approvals.slice(0, 50);
      break;
    case 'compaction':
      appendProjectActivity(project.id, 'compaction', eventData);
      break;
    case 'instinct_new':
      appendProjectActivity(project.id, 'instinct_new', eventData);
      break;
    case 'voice_summary':
      appendProjectActivity(project.id, 'voice_summary', eventData);
      setProjectAnswer(project.id, payload.summary || '', payload.success ? 'done' : 'failed');
      break;
    case 'chain_done':
      touchProject(project, { status: payload.success === false ? 'failed' : 'done' });
      appendProjectActivity(project.id, 'chain_done', eventData);
      break;
    default:
      appendProjectActivity(project.id, type, eventData);
      break;
  }

  broadcastEvent('project_updated', {
    project_id: project.id,
    type,
    project: serializeProject(project),
  });

  return project;
}

createProject();

// ── Health ───────────────────────────────────────────────────────────────────
app.get('/api/health', async (req, res) => {
  const stats = await memory.getCacheStats();
  res.json({
    status:            'ok',
    port:              PORT,
    headless_mode:     isHeadlessMode(),
    chains_running:    activeChains.size,
    active_chains:     [...activeChains.entries()].map(([pid, c]) => ({ project_id: pid, task: c.task })),
    active_project_id: activeProjectId,
    gateway_sessions:  gatewaySessions.size,
    cache_stats:       stats,
    // legacy shim fields kept for existing monitors
    chain_running:     activeChains.size > 0,
    active_task:       activeChainTask,
    cache:             stats,
  });
});

// ── Status (dashboard / TUI) ─────────────────────────────────────────────────
app.get('/api/status', async (req, res) => {
  const run = await memory.getRun() || {};
  res.json({
    chains_running:    activeChains.size,
    active_chains:     [...activeChains.entries()].map(([pid, c]) => ({ project_id: pid, task: c.task })),
    chain_running:     activeChains.size > 0,          // legacy shim
    active_task:       activeChainTask,                // legacy shim
    headless_mode:     isHeadlessMode(),
    llm:               activeProvider(),
    run_state:         run,
    active_project_id: activeProjectId,
    gateway_sessions:  gatewaySessions.size,
    projects:          listProjects(),
  });
});

// ── Project / session workspace ──────────────────────────────────────────────
app.get('/api/projects', (_req, res) => {
  res.json({
    active_project_id: activeProjectId,
    projects: listProjects(),
  });
});

app.post('/api/projects', (req, res) => {
  const { title } = req.body || {};
  const project = createProject(title);
  activeProjectId = project.id;
  res.json({ ok: true, project: serializeProject(project) });
});

app.get('/api/projects/:id', (req, res) => {
  const project = projectStore.get(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  res.json({ project: serializeProject(project) });
});

app.patch('/api/projects/:id', (req, res) => {
  const project = projectStore.get(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  const { title, status, answer_status, pinned_tools, active_mode } = req.body || {};
  touchProject(project, {
    ...(title ? { title: String(title).trim() || project.title } : {}),
    ...(status ? { status } : {}),
    ...(answer_status ? { answer_status } : {}),
    ...(Array.isArray(pinned_tools) ? { pinned_tools } : {}),
    ...(active_mode ? { active_mode } : {}),
  });
  res.json({ ok: true, project: serializeProject(project) });
});

app.post('/api/projects/:id/messages', (req, res) => {
  const project = projectStore.get(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  const { role = 'user', text = '', meta = {} } = req.body || {};
  const message = appendProjectMessage(project.id, role, text, meta);
  res.json({ ok: true, message });
});

app.post('/api/projects/:id/activity', (req, res) => {
  const project = projectStore.get(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  const { type = 'note', payload = {} } = req.body || {};
  const activity = appendProjectActivity(project.id, type, payload);
  res.json({ ok: true, activity });
});

app.post('/api/projects/:id/answer', (req, res) => {
  const project = projectStore.get(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  const { text = '', status = 'idle' } = req.body || {};
  setProjectAnswer(project.id, text, status);
  res.json({ ok: true, answer: project.answer, answer_status: project.answer_status });
});

app.patch('/api/projects/:id/browser-context', (req, res) => {
  const project = projectStore.get(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  const context = updateProjectBrowserContext(project.id, req.body || {});
  res.json({ ok: true, browser_context: context });
});

// ── Agents ───────────────────────────────────────────────────────────────────
app.get('/api/agents', (req, res) => {
  res.json(listAgents());
});

app.post('/api/agent/:name/run', async (req, res) => {
  const { name } = req.params;
  const input = req.body || {};
  try {
    const result = await runAgent(name, input, memory);
    res.json(result);
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

// ── Task planning ─────────────────────────────────────────────────────────────
// Returns the Cortex plan without executing the chain.
app.post('/api/tasks/plan', async (req, res) => {
  const { task } = req.body || {};
  if (!task) return res.status(400).json({ error: 'task required' });

  if (isHeadlessMode()) {
    return res.status(403).json({
      error: 'Planning disabled in HEADLESS_MODE — external LLM is the planner',
    });
  }

  try {
    const planResult = await runAgent('cortex', { task, query: task }, memory);
    if (!planResult?.plan) {
      return res.status(500).json({ error: 'Cortex produced no plan' });
    }
    res.json({
      task,
      agents: planResult.plan.map(s => s.agent),
      pattern: planResult.pattern || 'default',
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Task execution ────────────────────────────────────────────────────────────
// Starts the full chain and streams events via WebSocket /ws.
app.post('/api/tasks/run', async (req, res) => {
  const { task, project_id } = req.body || {};
  if (!task) return res.status(400).json({ error: 'task required' });

  if (isHeadlessMode()) {
    return res.status(403).json({ error: 'Chain execution disabled in HEADLESS_MODE — external LLM calls octopus_* tools directly' });
  }

  const project = getProject(project_id);
  // Per-project chain lock — allows parallel tasks on different projects
  if (isChainRunning(project.id)) {
    return res.status(409).json({ error: 'This project already has a chain running', active_task: activeChains.get(project.id)?.task });
  }

  activeProjectId = project.id;
  startChain(project.id, task);
  appendProjectActivity(project.id, 'task_started', { task });
  setProjectAnswer(project.id, 'Working…', 'running');
  res.json({ ok: true, task, project_id: project.id, message: 'Chain started — follow events on /ws' });

  // Run asynchronously so the HTTP response returns immediately
  setImmediate(async () => {
    try {
      const emit = (type, data = {}) => {
        recordProjectEvent(project.id, type, data);
        broadcastEvent(type, { ...data, project_id: project.id });
      };
      const result = await runTask(task, memory, emit);
      const agentCount = Array.isArray(result?.agents_spawned) ? result.agents_spawned.length : 0;
      setProjectAnswer(project.id, `Completed ${task}. ${agentCount} agents ran.`, 'done');
    } catch (err) {
      console.error(`[server] Chain error: ${err.message}`);
      setProjectAnswer(project.id, `Task failed: ${err.message}`, 'failed');
    } finally {
      endChain(project.id);
    }
  });
});

// ── Task interrupt ────────────────────────────────────────────────────────────
app.post('/api/tasks/interrupt', (req, res) => {
  const { project_id } = req.body || {};
  // Interrupt specific project, or the most-recently-active one
  const project = getProject(project_id);
  const chain   = activeChains.get(project.id);
  if (!chain) {
    return res.status(409).json({ error: 'No chain is running for this project' });
  }
  const interrupted = chain.task;
  endChain(project.id);
  recordProjectEvent(project.id, 'chain_done', { task: interrupted, success: false, interrupted: true, duration_ms: 0, project_id: project.id });
  broadcastEvent('chain_done', { task: interrupted, success: false, interrupted: true, duration_ms: 0, project_id: project.id });
  setProjectAnswer(project.id, 'Task interrupted.', 'failed');
  res.json({ ok: true, interrupted });
});

// ── Voice-friendly task path ─────────────────────────────────────────────────
// Accepts a voice prompt, plans and runs the chain, returns a short TTS-ready summary.
app.post('/api/tasks/voice', async (req, res) => {
  const { text, project_id } = req.body || {};
  if (!text) return res.status(400).json({ error: 'text required' });

  if (isHeadlessMode()) {
    return res.status(403).json({ error: 'Not available in HEADLESS_MODE' });
  }

  const project = getProject(project_id);
  if (isChainRunning(project.id)) {
    return res.status(409).json({ error: 'A chain is already running on this project' });
  }

  activeProjectId = project.id;
  startChain(project.id, text);
  appendProjectActivity(project.id, 'voice_task_started', { text });
  setProjectAnswer(project.id, 'Listening and working…', 'running');
  const startMs = Date.now();

  setImmediate(async () => {
    try {
      const emit = (type, data = {}) => {
        recordProjectEvent(project.id, type, data);
        broadcastEvent(type, { ...data, project_id: project.id });
      };
      const result = await runTask(text, memory, emit);
      const elapsed = ((Date.now() - startMs) / 1000).toFixed(1);
      const spawned = Array.isArray(result?.agents_spawned) ? result.agents_spawned.length : 0;
      setProjectAnswer(project.id, `Completed in ${elapsed}s. ${spawned} agents ran.`, 'done');
      broadcastEvent('voice_summary', {
        summary: `Task complete in ${elapsed}s. ${spawned} agents ran.`,
        success: true,
        project_id: project.id,
      });
    } catch (err) {
      setProjectAnswer(project.id, `Task failed: ${err.message}`, 'failed');
      broadcastEvent('voice_summary', { summary: `Task failed: ${err.message}`, success: false, project_id: project.id });
    } finally {
      endChain(project.id);
    }
  });

  res.json({ ok: true, text, project_id: project.id, message: 'Voice task started — summary will follow on /ws' });
});

// ── Security scan ─────────────────────────────────────────────────────────────
app.post('/api/security/scan', async (req, res) => {
  const { target } = req.body || {};
  if (!target) return res.status(400).json({ error: 'target required' });
  try {
    const result = await runAgent('securityreviewer', { task: `Security scan: ${target}`, query: target, target }, memory);
    res.json({
      findings: result.findings || [],
      critical: (result.findings || []).filter(f => f.severity === 'critical' || f.severity === 'high').length,
      approved: result.approved,
      advice: result.advice,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Commands ─────────────────────────────────────────────────────────────────
app.post('/api/onboard', async (req, res) => {
  const files = await memory.searchStructural('');
  await memory.saveRun({ task: 'onboard', status: 'idle' });
  res.json({
    command: '/onboard',
    indexed_files: files.length,
    sample: files.slice(0, 5).map(f => f.path),
    advice: 'Memory loaded. Query Atlas before opening any files.',
  });
});

app.post('/api/plan-feature', async (req, res) => {
  const { query = 'feature' } = req.body;
  const result = await runAgent('cortex', { task: query, query }, memory);
  res.json(result);
});

// Legacy route kept for backwards compatibility
app.post('/api/task/run', async (req, res) => {
  const { task = 'default task' } = req.body;
  try {
    const result = await runTask(task, memory, broadcastEvent);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/release-check', async (req, res) => {
  const { task = 'release' } = req.body;
  const result = await runAgent('releaseKeeper', { task }, memory);
  res.json(result);
});

// ── Memory pass-through ───────────────────────────────────────────────────────

// Primary search endpoint (used by OctopusClient.searchMemory)
app.get('/api/memory/search', async (req, res) => {
  const { q = '', limit = 10 } = req.query;
  const results = await memory.searchStructural(q, Number(limit));
  res.json({ results: (results || []).map(r => r.path || r.summary || String(r)) });
});

app.get('/api/memory/structural', async (req, res) => {
  const { q = '', limit = 10 } = req.query;
  const results = await memory.searchStructural(q, Number(limit));
  res.json(results);
});

app.get('/api/memory/decisions', async (req, res) => {
  const { tags, limit = 20 } = req.query;
  const results = await memory.getDecisions(tags ? tags.split(',') : null, Number(limit));
  res.json(results || []);
});

app.get('/api/memory/run', async (req, res) => {
  res.json(await memory.getRun() || {});
});

app.post('/api/memory/run', async (req, res) => {
  await memory.saveRun(req.body);
  res.json({ ok: true });
});

app.post('/api/memory/compact', async (req, res) => {
  const { summary = '', facts = [] } = req.body;
  const result = await memory.compactSession(summary, facts);
  res.json(result || { ok: true });
});

app.get('/api/memory/cache-stats', async (req, res) => {
  res.json(await memory.getCacheStats() || {});
});

// ── Missing proxy routes (audited) ────────────────────────────────────────────
app.get('/api/context/:agentName', async (req, res) => {
  const { agentName } = req.params;
  const { task = '', q } = req.query;
  const ctx = await memory.getContext(agentName, task, q || task);
  res.json(ctx || {});
});

app.post('/api/writeback', async (req, res) => {
  const { agent = 'unknown', ...payload } = req.body || {};
  const result = await memory.writeback(agent, payload);
  res.json(result || { ok: true });
});

app.post('/api/structural/impact', async (req, res) => {
  const { paths = [] } = req.body || {};
  const result = await memory.structuralImpact(paths);
  res.json(result || []);
});

// ── Skill Evolution Marketplace ───────────────────────────────────────────────
app.get('/api/skills', (req, res) => {
  const { status } = req.query;
  res.json(skillRegistry.listSkills(status || null));
});

app.post('/api/skills/scout', async (req, res) => {
  const { topics } = req.body || {};
  try {
    const result = await runAgent('marketscout', { topics }, memory);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/skills/synthesize', async (req, res) => {
  const { name, doc_url, description } = req.body || {};
  if (!name || !doc_url || !description) return res.status(400).json({ error: 'name, doc_url, description required' });
  try {
    const result = await runAgent('toolsmith', { name, doc_url, description }, memory);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/skills/validate/:skill_id', async (req, res) => {
  try {
    const result = await runAgent('sandboxqa', { skill_id: req.params.skill_id }, memory);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/skills/deploy/:skill_id', (req, res) => {
  try {
    const { retires } = req.body || {};
    if (retires) skillRegistry.retire(retires, `Superseded by ${req.params.skill_id}`);
    const skill = skillRegistry.deploy(req.params.skill_id);
    res.json({ ok: true, skill });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/skills/retire/:skill_id', (req, res) => {
  try {
    const skill = skillRegistry.retire(req.params.skill_id, req.body?.reason || '');
    res.json({ ok: true, skill });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ── Tool adapters (install on any LLM) ───────────────────────────────────────
app.get('/api/tools', (_req, res) => {
  res.json({ formats: SUPPORTED_FORMATS });
});

app.get('/api/tools/:format', (req, res) => {
  try {
    res.json(getTools(req.params.format));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ── Multi-LLM gateway ─────────────────────────────────────────────────────────
app.get('/api/llm/provider', (_req, res) => {
  res.json(activeProvider());
});

app.post('/api/llm/complete', async (req, res) => {
  const { prompt, maxTokens, timeout } = req.body || {};
  if (!prompt) return res.status(400).json({ error: 'prompt required' });
  try {
    const text = await complete(prompt, { maxTokens, timeout });
    res.json({ text, ...activeProvider() });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// ── Tool plugins ──────────────────────────────────────────────────────────────
app.get('/api/plugins', (_req, res) => {
  res.json(toolLoader.listTools());
});

app.post('/api/plugins/call/:name', async (req, res) => {
  try {
    const result = await toolLoader.callTool(req.params.name, req.body || {});
    res.json({ ok: true, result });
  } catch (err) {
    const status = err.message.includes('Unknown tool') ? 404 : 400;
    res.status(status).json({ error: err.message });
  }
});

// ── Web Search ───────────────────────────────────────────────────────────────
app.post('/api/search', async (req, res) => {
  const { query, limit = 8, engine = 'auto' } = req.body || {};
  if (!query || !query.trim()) {
    return res.status(400).json({ error: 'query is required' });
  }
  try {
    const results  = await webSearch(query.trim(), { limit, engine });
    const markdown = formatResults(results);
    broadcastEvent('web_search', { query, count: results.length });
    res.json({ query, results, markdown });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Document Upload & Analysis ────────────────────────────────────────────────
// Uses multer for multipart/form-data. Falls back to raw body buffer if multer
// is not installed (text files only in that case).
let upload;
try {
  const multer = require('multer');
  upload = multer({
    storage: multer.memoryStorage(),
    limits:  { fileSize: 50 * 1024 * 1024 }, // 50 MB
  });
} catch (_) {
  upload = null; // multer not installed — text-only fallback
}

function uploadMiddleware(req, res, next) {
  if (upload) return upload.single('file')(req, res, next);
  // Fallback: read raw body as Buffer
  const chunks = [];
  req.on('data', c => chunks.push(c));
  req.on('end', () => {
    req.file = {
      buffer:   Buffer.concat(chunks),
      originalname: req.headers['x-filename'] || 'upload.txt',
      mimetype: req.headers['content-type'] || 'text/plain',
    };
    next();
  });
}

app.post('/api/documents/upload', uploadMiddleware, async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const { mode = 'summarise', question = '' } = req.body || {};
  const filename = req.file.originalname || 'document';

  broadcastEvent('document_upload', { filename, mode });

  // Run extraction first — always succeeds for supported text types
  const { extractText } = require('./tools/document');
  let extracted;
  try {
    extracted = await extractText(req.file.buffer, filename);
  } catch (err) {
    return res.status(500).json({ error: 'Extraction failed: ' + err.message });
  }

  // Run LLM analysis — degrade gracefully if LLM is unavailable
  let analysis = '';
  let analysisError = null;
  try {
    const { analyseText, analyseWithVision } = require('./tools/document');
    if (extracted.type === 'image') {
      analysis = await analyseWithVision(extracted.imageBase64, extracted.mimeType,
        question || 'Describe and extract all information from this image.', { question });
    } else if (extracted.type !== 'unsupported') {
      analysis = await analyseText(extracted.text, mode, { question });
    } else {
      analysis = extracted.text;
    }
  } catch (err) {
    analysisError = err.message;
    // Return extracted text with error note so UI is still useful
    analysis = extracted.text
      ? `[LLM analysis unavailable: ${err.message}]\n\n--- EXTRACTED TEXT ---\n${extracted.text.slice(0, 8000)}`
      : `[LLM analysis unavailable: ${err.message}]`;
  }

  const result = {
    filename,
    type:       extracted.type,
    charCount:  extracted.text ? extracted.text.length : req.file.buffer.length,
    pages:      extracted.pages,
    analysis,
    analysisError,
  };

  broadcastEvent('document_done', { filename, type: result.type, charCount: result.charCount });
  res.json({ ok: !analysisError, ...result });
});

app.get('/api/documents/modes', (_req, res) => {
  res.json({
    modes: ['summarise', 'analyse', 'extract', 'code_review', 'explain', 'qa'],
    supported_extensions: [
      '.txt','.md','.csv','.json','.xml','.html','.js','.ts','.py','.java',
      '.go','.rs','.cpp','.c','.sh','.yaml','.yml','.sql','.css','.log',
    ],
    optional: {
      pdf:  'npm install pdf-parse  + ENABLE_PDF=true',
      docx: 'npm install mammoth    + ENABLE_DOCX=true',
      xlsx: 'npm install xlsx       + ENABLE_XLSX=true',
    },
  });
});

// ── Streaming Text Completion (SSE) ───────────────────────────────────────────
// Streams LLM completion via Server-Sent Events for real-time text output.
app.post('/api/complete/stream', async (req, res) => {
  const { prompt, role = 'default', maxTokens = 2048 } = req.body || {};
  if (!prompt) return res.status(400).json({ error: 'prompt is required' });

  res.setHeader('Content-Type',  'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection',    'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  send({ type: 'start', role });

  try {
    const answer = await complete(prompt, { maxTokens, role, timeout: 120000 });
    // Simulate streaming by chunking the result (real streaming requires per-provider SSE support)
    const words = answer.split(' ');
    const CHUNK = 8;
    for (let i = 0; i < words.length; i += CHUNK) {
      const chunk = words.slice(i, i + CHUNK).join(' ') + (i + CHUNK < words.length ? ' ' : '');
      send({ type: 'chunk', text: chunk });
      await new Promise(r => setTimeout(r, 30));
    }
    send({ type: 'done', full: answer });
  } catch (err) {
    send({ type: 'error', message: err.message });
  }

  res.end();
});

// ── Gateways ─────────────────────────────────────────────────────────────────
app.get('/api/gateways', (_req, res) => {
  res.json({ gateways: gatewayManager.status() });
});

app.post('/api/gateways/:name/send', async (req, res) => {
  const { name } = req.params;
  const { channel, text } = req.body || {};
  if (!channel || !text) return res.status(400).json({ error: 'channel and text required' });
  try {
    await gatewayManager.sendTo(name, channel, text);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ── Task Router Status ────────────────────────────────────────────────────────
app.get('/api/router', (_req, res) => {
  const { summarise } = require('./task_router');
  res.json({ routes: summarise() });
});

// ── Setup wizard ──────────────────────────────────────────────────────────────
app.use('/api/setup', setupRouter);
app.get('/setup', (_req, res) => res.sendFile(SETUP_HTML));

// ── Web dashboard (power-user UI, no hardware needed) ────────────────────────
const DASHBOARD_HTML = path.join(__dirname, 'dashboard', 'index.html');
app.get('/dashboard', (_req, res) => res.sendFile(DASHBOARD_HTML));
app.get('/', (_req, res) => {
  if (!isSetupComplete()) return res.redirect('/setup');
  res.redirect('/dashboard');
});

// ── 404 catch-all ─────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: `Not found: ${req.method} ${req.path}` });
});

// ── Start ─────────────────────────────────────────────────────────────────────
if (require.main === module) {
  httpServer.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`[server] Port ${PORT} is already in use.`);
      console.error(`[server] Kill the old process with:`);
      console.error(`[server]   Windows: Get-Process -Id (Get-NetTCPConnection -LocalPort ${PORT}).OwningProcess | Stop-Process -Force`);
      console.error(`[server]   Mac/Linux: lsof -ti :${PORT} | xargs kill -9`);
      process.exit(1);
    } else {
      console.error(`[server] Fatal: ${err.message}`);
      process.exit(1);
    }
  });
  httpServer.listen(PORT, async () => {
    console.error(`Octopus API running on http://localhost:${PORT}`);
    console.error(`WebSocket events:   ws://localhost:${PORT}/ws`);
    console.error(`HEADLESS_MODE:      ${isHeadlessMode()}`);

    // Wire gateways: each gateway user gets their own project (session isolation)
    const gatewayTaskHandler = async (text, ctx) => {
      try {
        // Resolve a per-user project for this gateway — prevents state collisions
        const gateway = ctx.gateway || 'unknown';
        const userId  = ctx.sender  || 'anon';
        const project = getOrCreateGatewayProject(gateway, userId);

        // Check if this project already has a running chain
        if (isChainRunning(project.id)) {
          return 'Still working on your previous request — please wait.';
        }

        startChain(project.id, text);
        appendProjectActivity(project.id, 'gateway_task_started', { gateway, text });
        setProjectAnswer(project.id, 'Working…', 'running');

        // Broadcast so Dashboard switches to this project
        broadcastEvent('gateway_task_start', { gateway, sender: userId, text, project_id: project.id });

        const startMs = Date.now();
        const emit = (type, data = {}) => {
          recordProjectEvent(project.id, type, data);
          broadcastEvent(type, { ...data, project_id: project.id });
        };

        const result = await runTask(text, memory, emit);
        const elapsed = ((Date.now() - startMs) / 1000).toFixed(1);
        const spawned = Array.isArray(result?.agents_spawned) ? result.agents_spawned.length : 0;

        // Build a human-readable TTS/text reply
        const answer  = project.answer || `Completed in ${elapsed}s.`;
        const summary = answer.length > 400 ? answer.slice(0, 400) + '…' : answer;
        setProjectAnswer(project.id, summary, 'done');
        endChain(project.id);
        return `[${spawned} agents · ${elapsed}s] ${summary}`;
      } catch (err) {
        endChain(ctx.projectId);
        return `Task failed: ${err.message}`;
      }
    };

    await initGateways(gatewayTaskHandler, broadcastEvent);
  });
}

module.exports = app;
