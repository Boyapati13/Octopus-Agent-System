#!/usr/bin/env node
'use strict';

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} = require('@modelcontextprotocol/sdk/types.js');
const memory = require('./memory');
const { runTask } = require('./runner');
const { runAgent } = require('./agents');

const server = new Server(
  {
    name: 'octopus-mcp-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Define tools available to LLMs
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'octopus_plan_task',
        description: 'Ask Cortex to break down a complex task into an execution plan of specialized agents.',
        inputSchema: {
          type: 'object',
          properties: {
            task: { type: 'string', description: 'The task description' },
          },
          required: ['task'],
        },
      },
      {
        name: 'octopus_run_task_chain',
        description: 'Run the entire dynamic Octopus agent chain (Cortex planning + all needed agents + gate verification + session compact).',
        inputSchema: {
          type: 'object',
          properties: {
            task: { type: 'string', description: 'The task description' },
          },
          required: ['task'],
        },
      },
      {
        name: 'octopus_search_memory',
        description: 'Query the L1 structural graph memory to find relevant indexed files and their architectural context.',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search term (e.g. file name or symbol)' },
            limit: { type: 'number', description: 'Max results to return' },
          },
          required: ['query'],
        },
      },
      {
        name: 'octopus_get_decisions',
        description: 'Retrieve past architectural decisions and risk flags from L2 memory.',
        inputSchema: {
          type: 'object',
          properties: {
            tags: { type: 'array', items: { type: 'string' }, description: 'Optional tags to filter by' },
          },
        },
      },
      {
        name: 'octopus_compact_session',
        description: 'Compress current workspace context into long-term memory at the end of an LLM session.',
        inputSchema: {
          type: 'object',
          properties: {
            summary: { type: 'string', description: 'Summary of what was achieved' },
            facts: { type: 'array', items: { type: 'string' }, description: 'Array of factual string outcomes' },
          },
          required: ['summary', 'facts'],
        },
      }
    ],
  };
});

// Handle tool execution
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    let result;
    switch (name) {
      case 'octopus_plan_task':
        result = await runAgent('cortex', { task: args.task }, memory);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };

      case 'octopus_run_task_chain':
        result = await runTask(args.task, memory);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };

      case 'octopus_search_memory':
        result = await memory.searchStructural(args.query, args.limit || 5);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };

      case 'octopus_get_decisions':
        result = await memory.getDecisions(args.tags);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };

      case 'octopus_compact_session':
        result = await memory.compactSession(args.summary, args.facts);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return {
      content: [{ type: 'text', text: `Error executing tool: ${error.message}` }],
      isError: true,
    };
  }
});

// Start the server
async function run() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[mcp] Octopus Server started on stdio');
}

run().catch(console.error);
