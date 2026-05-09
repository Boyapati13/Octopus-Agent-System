'use strict';
const express = require('express');
const cors    = require('cors');
const memory  = require('./memory');
const { listAgents, runAgent } = require('./agents');
const { runTask } = require('./runner');

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

// ── Start ─────────────────────────────────────────────────────────────────────
if (require.main === module) {
  app.listen(PORT, () => console.log(`Octopus API running on http://localhost:${PORT}`));
}

module.exports = app;
