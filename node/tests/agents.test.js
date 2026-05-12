'use strict';
jest.mock('../src/memory');
// Mock LLM so Cortex uses keyword fallback without hitting the network
jest.mock('../src/llm', () => ({
  complete:       jest.fn().mockRejectedValue(new Error('LLM mocked — using keyword fallback')),
  activeProvider: jest.fn().mockReturnValue({ provider: 'anthropic', model: 'claude-sonnet-4-6' }),
}));
const memory = require('../src/memory');

const fs = require('fs');
const AGENTS = ['cortex','atlas','architect','forge','reviewer','securityReviewer','factChecker','probe','scribe','releaseKeeper'];

const mockCtx = {
  relevant_files: [{ path: 'src/app.py', symbols: ['main'], imports: ['os'], summary: 'Entry', relevance_score: 3 }],
  run_state: { task: 'test task', status: 'in-progress', changed_files: ['src/app.py'], approvals: [], blockers: [], notes: [] },
  recent_decisions: [{ title: 'Use SQLite', rationale: 'Simple', tags: ['storage'], risk: 'low' }],
  boundary_impact: [],
};

beforeEach(() => {
  jest.resetAllMocks();
  // Re-apply LLM mock after resetAllMocks() clears implementations
  const llm = require('../src/llm');
  llm.complete.mockRejectedValue(new Error('LLM mocked — using keyword fallback'));
  llm.activeProvider.mockReturnValue({ provider: 'anthropic', model: 'claude-sonnet-4-6' });
  memory.getContext.mockResolvedValue(mockCtx);
  memory.getRun.mockResolvedValue(mockCtx.run_state);
  memory.getDecisions.mockResolvedValue(mockCtx.recent_decisions);
  memory.searchStructural.mockResolvedValue(mockCtx.relevant_files);
  memory.writeback.mockResolvedValue({ ok: true });
  memory.saveRun.mockResolvedValue({ ok: true });
});

for (const agentFile of AGENTS) {
  describe(`Agent: ${agentFile}`, () => {
    const agent = require(`../src/agents/${agentFile}`);

    test('has required exports', () => {
      expect(typeof agent.name).toBe('string');
      expect(typeof agent.role).toBe('string');
      expect(typeof agent.canApprove).toBe('boolean');
      expect(typeof agent.run).toBe('function');
    });

    test('run() returns agent name and role', async () => {
      const result = await agent.run({ task: 'test task', query: 'app' }, memory);
      expect(result.agent).toBe(agent.name);
      expect(result.role).toBe(agent.role);
    });

    test('run() returns an advice string', async () => {
      const result = await agent.run({ task: 'test task', query: 'app' }, memory);
      expect(typeof result.advice).toBe('string');
      expect(result.advice.length).toBeGreaterThan(0);
    });
  });
}

test('SecurityReviewer flags eval in symbols', async () => {
  fs.writeFileSync('bad.py', 'eval(x)', 'utf8');
  memory.getContext.mockResolvedValue({
    ...mockCtx,
    relevant_files: [{ path: 'bad.py', symbols: [], imports: [], summary: 'Bad code', relevance_score: 3 }],
  });
  const agent = require('../src/agents/securityReviewer');
  const result = await agent.run({ task: 'audit' }, memory);
  fs.unlinkSync('bad.py');
  expect(result.findings.length).toBeGreaterThan(0);
});

test('ReleaseKeeper blocks when no approvals', async () => {
  memory.getContext.mockResolvedValue({ ...mockCtx, run_state: { ...mockCtx.run_state, approvals: [] } });
  const agent = require('../src/agents/releaseKeeper');
  const result = await agent.run({ task: 'release' }, memory);
  expect(result.all_gates_passed).toBe(false);
  expect(result.blockers.length).toBeGreaterThan(0);
});
