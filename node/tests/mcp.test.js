'use strict';
const path = require('path');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');

let client;
let transport;

beforeAll(async () => {
  // We use StdioClientTransport to spawn the MCP server process exactly as an LLM would
  transport = new StdioClientTransport({
    command: 'node',
    args: [path.join(__dirname, '../src/mcp.js')],
    env: { ...process.env, SAFE_MODE: 'true' }
  });

  client = new Client(
    { name: 'test-client', version: '1.0.0' },
    { capabilities: {} }
  );

  await client.connect(transport);
});

afterAll(async () => {
  await client.close();
});

test('listTools returns exactly 9 tools', async () => {
  const response = await client.listTools();
  expect(response.tools).toBeDefined();
  expect(response.tools.length).toBe(9);
  
  const toolNames = response.tools.map(t => t.name);
  expect(toolNames).toContain('octopus_plan_task');
  expect(toolNames).toContain('octopus_run_task_chain');
  expect(toolNames).toContain('octopus_search_memory');
  expect(toolNames).toContain('octopus_get_decisions');
  expect(toolNames).toContain('octopus_compact_session');
  expect(toolNames).toContain('octopus_execute_command');
  expect(toolNames).toContain('octopus_write_file');
  expect(toolNames).toContain('octopus_read_file');
  expect(toolNames).toContain('octopus_create_agent');
});

test('octopus_search_memory (read-only) succeeds in SAFE_MODE', async () => {
  const response = await client.callTool({
    name: 'octopus_search_memory',
    arguments: { query: 'test' }
  });
  
  expect(response.isError).toBeFalsy();
  const content = JSON.parse(response.content[0].text);
  expect(Array.isArray(content)).toBe(true);
});

test('octopus_run_task_chain fails with system_error due to SAFE_MODE', async () => {
  const response = await client.callTool({
    name: 'octopus_run_task_chain',
    arguments: { task: 'do dangerous things' }
  });
  
  expect(response.isError).toBe(true);
  
  const errorEnv = JSON.parse(response.content[0].text);
  expect(errorEnv.ok).toBe(false);
  expect(errorEnv.kind).toBe('system_error');
  expect(errorEnv.message).toBe('Tool disabled in SAFE_MODE');
});

test('new mutating tools fail with system_error due to SAFE_MODE', async () => {
  const executeCmd = await client.callTool({ name: 'octopus_execute_command', arguments: { command: 'echo 1' } });
  expect(executeCmd.isError).toBe(true);

  const writeFile = await client.callTool({ name: 'octopus_write_file', arguments: { path: 'test.js', content: '1' } });
  expect(writeFile.isError).toBe(true);

  const createAgent = await client.callTool({ name: 'octopus_create_agent', arguments: { agentName: 'x', role: 'y', javascriptLogic: 'z' } });
  expect(createAgent.isError).toBe(true);
});

test('concurrent read-only calls do not crash the server', async () => {
  const queries = ['user', 'auth', 'database'];
  
  const promises = queries.map(q => client.callTool({
    name: 'octopus_search_memory',
    arguments: { query: q }
  }));
  
  const results = await Promise.all(promises);
  expect(results.length).toBe(3);
  
  for (const r of results) {
    expect(r.isError).toBeFalsy();
  }
});
