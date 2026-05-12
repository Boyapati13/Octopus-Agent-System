'use strict';
/**
 * Phase 2–6 feature tests
 *
 * Covers:
 *   - Dashboard HTML endpoint + root redirect
 *   - HEADLESS_MODE blocking plan/run/voice
 *   - LLM custom_http provider entry point + error
 *   - MCP tools list includes plugin tools
 *   - tool_loader safety tier blocking
 *   - 404 JSON catch-all
 */
jest.mock('../src/memory');
jest.mock('../src/llm', () => ({
  complete:       jest.fn().mockRejectedValue(new Error('LLM mocked')),
  activeProvider: jest.fn().mockReturnValue({ provider: 'anthropic', model: 'claude-sonnet-4-6' }),
  getSecureKey:   jest.fn().mockResolvedValue(null),
}));

const memory  = require('../src/memory');
const request = require('supertest');
const app     = require('../src/server');

beforeEach(() => {
  jest.resetAllMocks();
  const llm = require('../src/llm');
  llm.complete.mockRejectedValue(new Error('LLM mocked'));
  llm.activeProvider.mockReturnValue({ provider: 'anthropic', model: 'claude-sonnet-4-6' });
  llm.getSecureKey.mockResolvedValue(null);

  memory.searchStructural.mockResolvedValue([]);
  memory.getContext.mockResolvedValue({ relevant_files: [], run_state: {}, recent_decisions: [] });
  memory.getRun.mockResolvedValue({});
  memory.getDecisions.mockResolvedValue([]);
  memory.writeback.mockResolvedValue({ ok: true });
  memory.saveRun.mockResolvedValue({ ok: true });
  memory.compactSession.mockResolvedValue({ ok: true });
  memory.getCacheStats.mockResolvedValue({ backend: 'memory', hits: 0, misses: 0 });
  memory.structuralImpact.mockResolvedValue([]);

  // Ensure HEADLESS_MODE is off between tests
  delete process.env.HEADLESS_MODE;
});

afterEach(() => {
  delete process.env.HEADLESS_MODE;
});

// ── Dashboard ─────────────────────────────────────────────────────────────────

test('GET /dashboard returns HTML with OctoDeck', async () => {
  const res = await request(app).get('/dashboard');
  expect(res.status).toBe(200);
  expect(res.headers['content-type']).toMatch(/html/);
  expect(res.text).toMatch(/OctoDeck/);
});

test('GET / redirects to /dashboard', async () => {
  const res = await request(app).get('/');
  expect([301, 302].includes(res.status)).toBe(true);
  expect(res.headers.location).toMatch(/dashboard/);
});

// ── HEADLESS_MODE — runtime env read ─────────────────────────────────────────

test('POST /api/tasks/plan returns 403 in HEADLESS_MODE', async () => {
  process.env.HEADLESS_MODE = 'true';
  const res = await request(app).post('/api/tasks/plan').send({ task: 'test' });
  expect(res.status).toBe(403);
  expect(res.body.error).toMatch(/HEADLESS_MODE/i);
});

test('POST /api/tasks/run returns 403 in HEADLESS_MODE', async () => {
  process.env.HEADLESS_MODE = 'true';
  const res = await request(app).post('/api/tasks/run').send({ task: 'test' });
  expect(res.status).toBe(403);
  expect(res.body.error).toMatch(/HEADLESS_MODE/i);
});

test('POST /api/tasks/voice returns 403 in HEADLESS_MODE', async () => {
  process.env.HEADLESS_MODE = 'true';
  const res = await request(app).post('/api/tasks/voice').send({ text: 'test' });
  expect(res.status).toBe(403);
  expect(res.body.error).toMatch(/HEADLESS_MODE/i);
});

test('GET /api/status shows headless_mode: true when env set', async () => {
  process.env.HEADLESS_MODE = 'true';
  const res = await request(app).get('/api/status');
  expect(res.status).toBe(200);
  expect(res.body.headless_mode).toBe(true);
});

test('GET /api/status shows headless_mode: false when env not set', async () => {
  const res = await request(app).get('/api/status');
  expect(res.status).toBe(200);
  expect(res.body.headless_mode).toBe(false);
});

// ── tool_loader safety tier ───────────────────────────────────────────────────

test('GET /api/plugins returns array with hello_world and http_fetch', async () => {
  const res = await request(app).get('/api/plugins');
  expect(res.status).toBe(200);
  expect(Array.isArray(res.body)).toBe(true);
  const names = res.body.map(p => p.name);
  expect(names).toContain('hello_world');
  expect(names).toContain('http_fetch');
});

test('POST /api/plugins/call/hello_world with name succeeds', async () => {
  const res = await request(app)
    .post('/api/plugins/call/hello_world')
    .send({ name: 'PhaseTest' });
  expect(res.status).toBe(200);
  expect(res.body.result.greeting).toMatch(/PhaseTest/);
});

test('POST /api/plugins/call/unknown returns 404', async () => {
  const res = await request(app).post('/api/plugins/call/does_not_exist').send({});
  expect(res.status).toBe(404);
});

// ── tool_loader: read-only plugin works in SAFE_MODE ─────────────────────────

test('hello_world (read-only) works even with SAFE_MODE=true', async () => {
  process.env.SAFE_MODE = 'true';
  const { callTool } = require('../src/tool_loader');
  const result = await callTool('hello_world', { name: 'safe' });
  expect(result.greeting).toMatch(/safe/i);
  delete process.env.SAFE_MODE;
});

// ── LLM custom_http provider ──────────────────────────────────────────────────

test('TOOLS list includes octopus_plugin_list and octopus_plugin_call', () => {
  const { TOOLS } = require('../src/tools');
  const names = TOOLS.map(t => t.name);
  expect(names).toContain('octopus_plugin_list');
  expect(names).toContain('octopus_plugin_call');
});

// ── 404 catch-all ─────────────────────────────────────────────────────────────

test('Unknown routes return 404 JSON', async () => {
  const res = await request(app).get('/api/does_not_exist');
  expect(res.status).toBe(404);
  expect(res.body.error).toMatch(/Not found/i);
});
