'use strict';
const express = require('express');
const cors    = require('cors');
const memory  = require('./memory');
const { listAgents, runAgent } = require('./agents');
const { runTask } = require('./runner');
const { complete, activeProvider } = require('./llm');
const { getTools, SUPPORTED_FORMATS } = require('./adapters');
const skillRegistry = require('./skill_registry');

const app  = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// ── Health ───────────────────────────────────────────────────────────────────
app.get('/api/health', async (req, res) => {
  const stats = await memory.getCacheStats();
  res.json({ status: 'ok', port: PORT, cache: stats });
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

app.post('/api/task/run', async (req, res) => {
  const { task = 'default task' } = req.body;
  try {
    const result = await runTask(task, memory);
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

// ── Start ─────────────────────────────────────────────────────────────────────
if (require.main === module) {
  app.listen(PORT, () => console.log(`Octopus API running on http://localhost:${PORT}`));
}

module.exports = app;
