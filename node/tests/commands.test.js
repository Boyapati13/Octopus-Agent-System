'use strict';
jest.mock('../src/memory');
jest.mock('../src/llm', () => ({
  complete:       jest.fn().mockRejectedValue(new Error('LLM mocked')),
  activeProvider: jest.fn().mockReturnValue({ provider: 'anthropic', model: 'claude-sonnet-4-6' }),
}));
const memory = require('../src/memory');
const request = require('supertest');

// Use the server directly for integration-style tests
const app = require('../src/server');

const mockFiles = [{ path: 'src/auth.py', symbols: ['login'], summary: 'Auth', relevance_score: 3 }];

beforeEach(() => {
  jest.resetAllMocks();
  memory.searchStructural.mockResolvedValue(mockFiles);
  memory.getContext.mockResolvedValue({
    relevant_files: mockFiles,
    run_state: { task: '', status: 'idle', changed_files: [], approvals: [], blockers: [], notes: [] },
    recent_decisions: [],
  });
  memory.getRun.mockResolvedValue({ task: '', status: 'idle', changed_files: [], approvals: [] });
  memory.getDecisions.mockResolvedValue([]);
  memory.writeback.mockResolvedValue({ ok: true });
  memory.saveRun.mockResolvedValue({ ok: true });
  memory.getCacheStats.mockResolvedValue({ backend: 'memory', hits: 0, misses: 0 });
});

test('GET /api/health returns ok', async () => {
  const res = await request(app).get('/api/health');
  expect(res.status).toBe(200);
  expect(res.body.status).toBe('ok');
});

test('GET /api/agents lists 14 agents', async () => {
  const res = await request(app).get('/api/agents');
  expect(res.status).toBe(200);
  expect(res.body.length).toBe(14);
});

test('POST /api/onboard returns indexed_files', async () => {
  const res = await request(app).post('/api/onboard');
  expect(res.status).toBe(200);
  expect(res.body).toHaveProperty('indexed_files');
});

test('POST /api/plan-feature returns plan steps', async () => {
  const res = await request(app).post('/api/plan-feature').send({ query: 'auth' });
  expect(res.status).toBe(200);
  expect(res.body.plan).toBeDefined();
});

test('POST /api/agent/atlas/run returns relevant_files', async () => {
  const res = await request(app).post('/api/agent/atlas/run').send({ task: 'auth', query: 'auth' });
  expect(res.status).toBe(200);
  expect(res.body).toHaveProperty('relevant_files');
});

test('POST /api/agent/unknown/run returns 404', async () => {
  const res = await request(app).post('/api/agent/unknown/run').send({});
  expect(res.status).toBe(404);
});
