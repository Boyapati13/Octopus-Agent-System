'use strict';
const http    = require('http');
const path    = require('path');
const { WebSocketServer } = require('ws');
const express = require('express');
const cors    = require('cors');
const memory  = require('./memory');
const { listAgents, runAgent, getAgent } = require('./agents');
const { runTask } = require('./runner');
const { complete, activeProvider } = require('./llm');
const { getTools, SUPPORTED_FORMATS } = require('./adapters');
const skillRegistry = require('./skill_registry');
const toolLoader = require('./tool_loader');

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

// ── Active chain state (one chain at a time for now) ─────────────────────────

let activeChainTask  = null;   // task description of running chain
let activeChainAbort = null;   // AbortController (future: stream abort)

// ── Health ───────────────────────────────────────────────────────────────────
app.get('/api/health', async (req, res) => {
  const stats = await memory.getCacheStats();
  res.json({
    status: 'ok',
    port: PORT,
    headless_mode: isHeadlessMode(),
    chain_running: activeChainTask !== null,
    active_task: activeChainTask,
    cache: stats,
  });
});

// ── Status (dashboard / TUI) ─────────────────────────────────────────────────
app.get('/api/status', async (req, res) => {
  const run = await memory.getRun() || {};
  res.json({
    chain_running: activeChainTask !== null,
    active_task: activeChainTask,
    headless_mode: isHeadlessMode(),
    llm: activeProvider(),
    run_state: run,
  });
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
  const { task } = req.body || {};
  if (!task) return res.status(400).json({ error: 'task required' });

  if (isHeadlessMode()) {
    return res.status(403).json({ error: 'Chain execution disabled in HEADLESS_MODE — external LLM calls octopus_* tools directly' });
  }

  if (activeChainTask !== null) {
    return res.status(409).json({ error: 'A chain is already running', active_task: activeChainTask });
  }

  activeChainTask = task;
  res.json({ ok: true, task, message: 'Chain started — follow events on /ws' });

  // Run asynchronously so the HTTP response returns immediately
  setImmediate(async () => {
    try {
      await runTask(task, memory, broadcastEvent);
    } catch (err) {
      console.error(`[server] Chain error: ${err.message}`);
    } finally {
      activeChainTask = null;
    }
  });
});

// ── Task interrupt ────────────────────────────────────────────────────────────
app.post('/api/tasks/interrupt', (req, res) => {
  if (!activeChainTask) {
    return res.status(409).json({ error: 'No chain is running' });
  }
  const interrupted = activeChainTask;
  activeChainTask = null;
  broadcastEvent('chain_done', { task: interrupted, success: false, interrupted: true, duration_ms: 0 });
  res.json({ ok: true, interrupted });
});

// ── Voice-friendly task path ─────────────────────────────────────────────────
// Accepts a voice prompt, plans and runs the chain, returns a short TTS-ready summary.
app.post('/api/tasks/voice', async (req, res) => {
  const { text } = req.body || {};
  if (!text) return res.status(400).json({ error: 'text required' });

  if (isHeadlessMode()) {
    return res.status(403).json({ error: 'Not available in HEADLESS_MODE' });
  }

  if (activeChainTask !== null) {
    return res.status(409).json({ error: 'A chain is already running' });
  }

  activeChainTask = text;
  // Fire chain in background; return a short TTS summary immediately
  const startMs = Date.now();

  setImmediate(async () => {
    try {
      const result = await runTask(text, memory, broadcastEvent);
      const elapsed = ((Date.now() - startMs) / 1000).toFixed(1);
      broadcastEvent('voice_summary', {
        summary: `Task complete in ${elapsed} seconds. ${result.agents_spawned.length} agents ran.`,
        success: true,
      });
    } catch (err) {
      broadcastEvent('voice_summary', { summary: `Task failed: ${err.message}`, success: false });
    } finally {
      activeChainTask = null;
    }
  });

  res.json({ ok: true, text, message: 'Voice task started — summary will follow on /ws' });
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

// ── Web dashboard (power-user UI, no hardware needed) ────────────────────────
const DASHBOARD_HTML = path.join(__dirname, 'dashboard', 'index.html');
app.get('/dashboard', (_req, res) => res.sendFile(DASHBOARD_HTML));
app.get('/', (_req, res) => res.redirect('/dashboard'));

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
  httpServer.listen(PORT, () => {
    console.error(`Octopus API running on http://localhost:${PORT}`);
    console.error(`WebSocket events:   ws://localhost:${PORT}/ws`);
    console.error(`HEADLESS_MODE:      ${isHeadlessMode()}`);
  });
}

module.exports = app;
