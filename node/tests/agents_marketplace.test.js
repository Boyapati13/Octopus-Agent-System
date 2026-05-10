'use strict';
/**
 * Tests for marketplace agents: Navigator, MarketScout, Toolsmith, SandboxQA.
 *
 * Jest rules for mock factories:
 *  - Variables referenced inside jest.mock(() => …) must be declared AFTER the
 *    mock call OR be prefixed with `mock` (case-insensitive).
 *  - We use the `mock` prefix convention throughout this file.
 */

jest.mock('../src/memory');

// ── child_process (Navigator uses promisify(execFile)) ──────────────────────
jest.mock('child_process', () => {
  const mockOut = JSON.stringify({ url: 'https://test.com', title: 'Test', elements: [] });
  const mockExecFile = jest.fn().mockImplementation((_b, _a, _o, cb) => {
    process.nextTick(() => cb(null, mockOut, ''));
  });
  // util.promisify looks for this well-known symbol; without it the callback
  // form still works but returns only stdout (not {stdout,stderr})
  mockExecFile[Symbol.for('nodejs.util.promisify.custom')] =
    async () => ({ stdout: mockOut, stderr: '' });
  return { execFile: mockExecFile };
});

// ── axios (MarketScout + Toolsmith fallback fetch) ──────────────────────────
jest.mock('axios', () => ({
  get: jest.fn().mockResolvedValue({
    data: 'Mock API documentation text for the library under test.',
  }),
}));

// ── LLM (Toolsmith synthesis) — variable must start with 'mock' ─────────────
const mockSynthJson = JSON.stringify({
  mcp_schema: {
    name: 'test_skill',
    description: 'Synthesised test skill.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  implementation: [
    "'use strict';",
    'async function run(args) { return { result: "ok" }; }',
    'module.exports = { run };',
  ].join('\n'),
});

jest.mock('../src/llm', () => ({
  complete:       jest.fn().mockResolvedValue(mockSynthJson),
  activeProvider: jest.fn().mockReturnValue({ provider: 'anthropic', model: 'claude-sonnet-4-6' }),
}));

// ── worker_threads (SandboxQA) ───────────────────────────────────────────────
jest.mock('worker_threads', () => {
  const { EventEmitter } = require('events');
  class MockWorker extends EventEmitter {
    constructor() {
      super();
      process.nextTick(() => this.emit('message', { passed: true, result: { ok: true } }));
    }
    terminate() {}
  }
  return { Worker: MockWorker, isMainThread: true };
});

// ── skill_registry (SandboxQA + Toolsmith) ───────────────────────────────────
const mockSkill = {
  skill_id:         'skill_abc123',
  name:             'test_skill',
  doc_url:          'https://npmjs.com/package/test-pkg',
  description:      'Test skill',
  execution_binary: '/tmp/test_skill_octopus.js',
  status:           'sandbox',
  qa_result:        null,
};

jest.mock('../src/skill_registry', () => ({
  propose:     jest.fn().mockReturnValue(mockSkill),
  getSkill:    jest.fn().mockReturnValue(mockSkill),
  updateSkill: jest.fn().mockImplementation((_id, patch) => ({ ...mockSkill, ...patch })),
  updateQA:    jest.fn().mockImplementation((_id, r)    => ({ ...mockSkill, qa_result: r })),
  deploy:      jest.fn().mockReturnValue({ ...mockSkill, status: 'active' }),
  retire:      jest.fn().mockReturnValue({ ...mockSkill, status: 'deprecated' }),
  listSkills:  jest.fn().mockReturnValue([mockSkill]),
  getActive:   jest.fn().mockReturnValue([]),          // needed by MarketScout deduplication
}));

// ── Test setup ───────────────────────────────────────────────────────────────
const fs     = require('fs');
const memory = require('../src/memory');

const mockCtx = {
  relevant_files:   [],
  run_state:        { task: 'test', status: 'idle', approvals: [], blockers: [], notes: [] },
  recent_decisions: [],
  boundary_impact:  [],
};

beforeEach(() => {
  jest.clearAllMocks();
  memory.getContext.mockResolvedValue(mockCtx);
  memory.getRun.mockResolvedValue(mockCtx.run_state);
  memory.getDecisions.mockResolvedValue([]);
  memory.searchStructural.mockResolvedValue([]);
  memory.writeback.mockResolvedValue({ ok: true });
  memory.saveRun.mockResolvedValue({ ok: true });
  memory.compactSession.mockResolvedValue({ ok: true });

  // SandboxQA calls fs.existsSync on the skill's execution_binary before
  // creating the Worker. Write the file so the check passes.
  fs.writeFileSync(
    mockSkill.execution_binary,
    "'use strict';\nasync function run(a){return{result:'ok'};}module.exports={run};",
    'utf8'
  );
});

afterEach(() => {
  try { fs.unlinkSync(mockSkill.execution_binary); } catch {}
});

// ── Navigator ────────────────────────────────────────────────────────────────
describe('Agent: Navigator', () => {
  const agent = require('../src/agents/navigator');

  test('has required contract exports', () => {
    expect(typeof agent.name).toBe('string');
    expect(typeof agent.role).toBe('string');
    expect(typeof agent.canApprove).toBe('boolean');
    expect(typeof agent.run).toBe('function');
  });

  test('run() returns agent name and role', async () => {
    const r = await agent.run({ url: 'https://example.com', task: 'browse' }, memory);
    expect(r.agent).toBe(agent.name);
    expect(r.role).toBe(agent.role);
  });

  test('run() always returns a snapshot field', async () => {
    const r = await agent.run({ url: 'https://example.com', task: 'browse' }, memory);
    expect(r).toHaveProperty('snapshot');
  });

  test('run() works snapshot-only (no url)', async () => {
    const r = await agent.run({ task: 'snapshot' }, memory);
    expect(r).toHaveProperty('snapshot');
  });
});

// ── MarketScout ──────────────────────────────────────────────────────────────
describe('Agent: MarketScout', () => {
  const agent = require('../src/agents/marketScout');

  test('has required contract exports', () => {
    expect(typeof agent.name).toBe('string');
    expect(typeof agent.role).toBe('string');
    expect(typeof agent.canApprove).toBe('boolean');
    expect(typeof agent.run).toBe('function');
  });

  test('run() returns agent name and role', async () => {
    const r = await agent.run({ topics: ['llm', 'mcp'] }, memory);
    expect(r.agent).toBe(agent.name);
    expect(r.role).toBe(agent.role);
  });

  test('run() returns a proposals array', async () => {
    const r = await agent.run({ topics: ['vector-search'] }, memory);
    expect(Array.isArray(r.proposals)).toBe(true);
  });

  test('run() tolerates empty topics', async () => {
    const r = await agent.run({ topics: [] }, memory);
    expect(r.agent).toBe(agent.name);
  });
});

// ── Toolsmith ────────────────────────────────────────────────────────────────
describe('Agent: Toolsmith', () => {
  const agent = require('../src/agents/toolsmith');

  test('has required contract exports', () => {
    expect(typeof agent.name).toBe('string');
    expect(typeof agent.role).toBe('string');
    expect(typeof agent.canApprove).toBe('boolean');
    expect(typeof agent.run).toBe('function');
  });

  test('run() returns agent name and role', async () => {
    const r = await agent.run(
      { name: 'test_skill', doc_url: 'https://npmjs.com/package/test-pkg', description: 'Test' },
      memory
    );
    expect(r.agent).toBe(agent.name);
    expect(r.role).toBe(agent.role);
  });

  test('run() returns a skill_id on success', async () => {
    const r = await agent.run(
      { name: 'test_skill', doc_url: 'https://npmjs.com/package/test-pkg', description: 'Test' },
      memory
    );
    expect(typeof r.skill_id).toBe('string');
  });

  test('run() returns approved:false when name/doc_url missing', async () => {
    const r = await agent.run({}, memory);
    expect(r.approved).toBe(false);
    expect(typeof r.error).toBe('string');
  });
});

// ── SandboxQA ────────────────────────────────────────────────────────────────
describe('Agent: SandboxQA', () => {
  const agent = require('../src/agents/sandboxQA');

  test('has required contract exports', () => {
    expect(typeof agent.name).toBe('string');
    expect(typeof agent.role).toBe('string');
    expect(typeof agent.canApprove).toBe('boolean');
    expect(typeof agent.run).toBe('function');
  });

  test('run() returns agent name and role', async () => {
    const r = await agent.run({ skill_id: 'skill_abc123' }, memory);
    expect(r.agent).toBe(agent.name);
    expect(r.role).toBe(agent.role);
  });

  test('run() returns approved:true when worker passes', async () => {
    const r = await agent.run({ skill_id: 'skill_abc123' }, memory);
    expect(r.approved).toBe(true);
    expect(typeof r.attempts).toBe('number');
  });

  test('run() returns approved:false when skill_id missing', async () => {
    const r = await agent.run({}, memory);
    expect(r.approved).toBe(false);
    expect(typeof r.error).toBe('string');
  });
});
