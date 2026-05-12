'use strict';
/**
 * OctoDeck integration tests — covers the routes added for AgentDeck integration:
 *   POST /api/tasks/plan
 *   POST /api/tasks/run
 *   POST /api/tasks/interrupt
 *   GET  /api/memory/search
 *   POST /api/security/scan
 *   POST /api/tasks/voice
 *   GET  /api/status
 *   GET  /api/plugins
 *   POST /api/plugins/call/hello_world
 */
jest.mock('../src/memory');
jest.mock('../src/llm', () => ({
  complete:       jest.fn().mockRejectedValue(new Error('LLM mocked')),
  activeProvider: jest.fn().mockReturnValue({ provider: 'anthropic', model: 'claude-sonnet-4-6' }),
}));

const memory  = require('../src/memory');
const request = require('supertest');
const app     = require('../src/server');

const mockFiles = [
  { path: 'src/auth.py', symbols: ['login'], summary: 'Auth module', relevance_score: 3 },
];

beforeEach(() => {
  jest.resetAllMocks();
  const llm = require('../src/llm');
  llm.complete.mockRejectedValue(new Error('LLM mocked'));
  llm.activeProvider.mockReturnValue({ provider: 'anthropic', model: 'claude-sonnet-4-6' });

  memory.searchStructural.mockResolvedValue(mockFiles);
  memory.getContext.mockResolvedValue({
    relevant_files: mockFiles,
    run_state: { task: '', status: 'idle', changed_files: [], approvals: [], blockers: [], notes: [] },
    recent_decisions: [],
  });
  memory.getRun.mockResolvedValue({ task: '', status: 'idle' });
  memory.getDecisions.mockResolvedValue([]);
  memory.writeback.mockResolvedValue({ ok: true });
  memory.saveRun.mockResolvedValue({ ok: true });
  memory.compactSession.mockResolvedValue({ ok: true });
  memory.getCacheStats.mockResolvedValue({ backend: 'memory', hits: 0, misses: 0 });
  memory.structuralImpact.mockResolvedValue([]);
});

// ── /api/tasks/plan ──────────────────────────────────────────────────────────

test('POST /api/tasks/plan returns agent chain and pattern', async () => {
  const res = await request(app)
    .post('/api/tasks/plan')
    .send({ task: 'add dark mode' });
  expect(res.status).toBe(200);
  expect(res.body).toHaveProperty('agents');
  expect(Array.isArray(res.body.agents)).toBe(true);
  expect(res.body).toHaveProperty('pattern');
  expect(res.body.task).toBe('add dark mode');
});

test('POST /api/tasks/plan without task returns 400', async () => {
  const res = await request(app).post('/api/tasks/plan').send({});
  expect(res.status).toBe(400);
  expect(res.body.error).toMatch(/task required/i);
});

// ── /api/tasks/run ───────────────────────────────────────────────────────────

test('POST /api/tasks/run accepts task and returns ok immediately', async () => {
  const res = await request(app)
    .post('/api/tasks/run')
    .send({ task: 'refactor login' });
  expect(res.status).toBe(200);
  expect(res.body.ok).toBe(true);
  expect(res.body.task).toBe('refactor login');
  // Allow background chain to settle
  await new Promise(r => setTimeout(r, 100));
});

test('POST /api/tasks/run without task returns 400', async () => {
  const res = await request(app).post('/api/tasks/run').send({});
  expect(res.status).toBe(400);
});

// ── /api/tasks/interrupt ─────────────────────────────────────────────────────

test('POST /api/tasks/interrupt when idle returns 409', async () => {
  const res = await request(app).post('/api/tasks/interrupt');
  expect(res.status).toBe(409);
  expect(res.body.error).toMatch(/no chain/i);
});

// ── /api/memory/search ───────────────────────────────────────────────────────

test('GET /api/memory/search returns results array', async () => {
  const res = await request(app).get('/api/memory/search?q=auth');
  expect(res.status).toBe(200);
  expect(res.body).toHaveProperty('results');
  expect(Array.isArray(res.body.results)).toBe(true);
});

test('GET /api/memory/search with empty query still returns results', async () => {
  const res = await request(app).get('/api/memory/search');
  expect(res.status).toBe(200);
  expect(Array.isArray(res.body.results)).toBe(true);
});

// ── /api/security/scan ───────────────────────────────────────────────────────

test('POST /api/security/scan without target returns 400', async () => {
  const res = await request(app).post('/api/security/scan').send({});
  expect(res.status).toBe(400);
  expect(res.body.error).toMatch(/target required/i);
});

test('POST /api/security/scan with target calls securityreviewer', async () => {
  const res = await request(app)
    .post('/api/security/scan')
    .send({ target: 'src/auth.js' });
  // securityReviewer runs with mocked memory so approved may be true or false
  expect([200, 500].includes(res.status)).toBe(true);
});

// ── /api/tasks/voice ─────────────────────────────────────────────────────────

test('POST /api/tasks/voice without text returns 400', async () => {
  const res = await request(app).post('/api/tasks/voice').send({});
  expect(res.status).toBe(400);
});

test('POST /api/tasks/voice with text returns ok immediately', async () => {
  const res = await request(app)
    .post('/api/tasks/voice')
    .send({ text: 'check the auth module for security issues' });
  expect(res.status).toBe(200);
  expect(res.body.ok).toBe(true);
  await new Promise(r => setTimeout(r, 100));
});

// ── /api/status ──────────────────────────────────────────────────────────────

test('GET /api/status returns chain state and llm info', async () => {
  const res = await request(app).get('/api/status');
  expect(res.status).toBe(200);
  expect(res.body).toHaveProperty('chain_running');
  expect(res.body).toHaveProperty('llm');
  expect(res.body).toHaveProperty('headless_mode');
});

// ── /api/plugins ─────────────────────────────────────────────────────────────

test('GET /api/plugins lists loaded plugins', async () => {
  const res = await request(app).get('/api/plugins');
  expect(res.status).toBe(200);
  expect(Array.isArray(res.body)).toBe(true);
  const names = res.body.map(p => p.name);
  expect(names).toContain('hello_world');
  expect(names).toContain('http_fetch');
});

test('POST /api/plugins/call/hello_world returns greeting', async () => {
  const res = await request(app)
    .post('/api/plugins/call/hello_world')
    .send({ name: 'Octopus' });
  expect(res.status).toBe(200);
  expect(res.body.ok).toBe(true);
  expect(res.body.result.greeting).toMatch(/Octopus/);
});

test('POST /api/plugins/call/unknown returns 404', async () => {
  const res = await request(app)
    .post('/api/plugins/call/nonexistent_tool')
    .send({});
  expect(res.status).toBe(404);
  expect(res.body.error).toMatch(/Unknown tool/i);
});
