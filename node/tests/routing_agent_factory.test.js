'use strict';
const fs   = require('fs');
const path = require('path');

const AGENTS_DIR  = path.join(__dirname, '..', 'src', 'agents');
const TEST_AGENT  = 'testDynamicFactory';
const VALID_CODE  = `'use strict';
const name = '${TEST_AGENT}';
const role = 'test';
const canApprove = false;
async function run() { return { ok: true }; }
module.exports = { name, role, canApprove, run };`;

jest.mock('../src/agents', () => ({
  injectAgent: jest.fn(),
  listAgents:  jest.fn(() => []),
  runAgent:    jest.fn(),
  getAgent:    jest.fn(),
}));

const { compileAndLoadAgent } = require('../src/routing/agent_factory');

afterEach(() => {
  const fp = path.join(AGENTS_DIR, `${TEST_AGENT}.js`);
  if (fs.existsSync(fp)) fs.unlinkSync(fp);
  jest.clearAllMocks();
});

test('writes agent file to disk', async () => {
  const { path: fp } = await compileAndLoadAgent(TEST_AGENT, VALID_CODE, null);
  expect(fs.existsSync(fp)).toBe(true);
  expect(fs.readFileSync(fp, 'utf8')).toContain(TEST_AGENT);
});

test('calls injectAgent with the new name', async () => {
  await compileAndLoadAgent(TEST_AGENT, VALID_CODE, null);
  const { injectAgent } = require('../src/agents');
  expect(injectAgent).toHaveBeenCalledWith(TEST_AGENT);
});

test('broadcasts instinct_new event', async () => {
  const events = [];
  await compileAndLoadAgent(TEST_AGENT, VALID_CODE, (type, data) => events.push({ type, data }));
  expect(events).toHaveLength(1);
  expect(events[0].type).toBe('instinct_new');
  expect(events[0].data.agent).toBe(TEST_AGENT);
  expect(typeof events[0].data.ts).toBe('number');
});

test('rejects invalid agent names', async () => {
  await expect(compileAndLoadAgent('../../evil', VALID_CODE, null))
    .rejects.toThrow('Invalid agent name');
  await expect(compileAndLoadAgent('1startsWithDigit', VALID_CODE, null))
    .rejects.toThrow('Invalid agent name');
  await expect(compileAndLoadAgent('has space', VALID_CODE, null))
    .rejects.toThrow('Invalid agent name');
});

test('returned path matches agents directory', async () => {
  const { path: fp } = await compileAndLoadAgent(TEST_AGENT, VALID_CODE, null);
  expect(fp).toBe(path.join(AGENTS_DIR, `${TEST_AGENT}.js`));
});
