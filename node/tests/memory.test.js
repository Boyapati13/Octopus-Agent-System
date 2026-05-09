'use strict';
jest.mock('../src/memory');

const memory = require('../src/memory');

const mockFiles = [
  { path: 'src/app.py',   symbols: ['main'],   summary: 'Entry point', relevance_score: 3 },
  { path: 'src/utils.py', symbols: ['helper'], summary: 'Utilities',   relevance_score: 1 },
];

beforeEach(() => {
  jest.resetAllMocks();
  memory.searchStructural.mockResolvedValue(mockFiles);
  memory.getContext.mockResolvedValue({ relevant_files: mockFiles, run_state: { task: '', status: 'idle', changed_files: [], approvals: [], notes: [], blockers: [] }, recent_decisions: [] });
  memory.getRun.mockResolvedValue({ task: '', status: 'idle', changed_files: [], approvals: [] });
  memory.getDecisions.mockResolvedValue([]);
  memory.writeback.mockResolvedValue({ ok: true });
  memory.saveRun.mockResolvedValue({ ok: true });
  memory.getCacheStats.mockResolvedValue({ backend: 'memory', hits: 0, misses: 0, hit_rate: 0 });
});

test('searchStructural returns ranked files', async () => {
  const results = await memory.searchStructural('app');
  expect(results).toHaveLength(2);
  expect(results[0].path).toBe('src/app.py');
});

test('findRelevantFiles scores and ranks correctly', () => {
  const { findRelevantFiles } = jest.requireActual('../src/memory');
  const files = [
    { path: 'src/app.py',   symbols: ['main'],   summary: 'Entry' },
    { path: 'src/utils.py', symbols: ['helper'], summary: 'Utils' },
    { path: 'README.md',    symbols: [],         summary: 'Docs' },
  ];
  const results = findRelevantFiles(files, 'app');
  expect(results[0].path).toBe('src/app.py');
  expect(results[0].relevance_score).toBeGreaterThan(0);
});

test('findRelevantFiles returns empty for no match', () => {
  const { findRelevantFiles } = jest.requireActual('../src/memory');
  expect(findRelevantFiles([], 'anything')).toEqual([]);
});
