#!/usr/bin/env node
'use strict';

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} = require('@modelcontextprotocol/sdk/types.js');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const memory = require('./memory');
const { runTask } = require('./runner');
const { runAgent, injectAgent } = require('./agents');
const { KINDS, OctopusError, formatError } = require('./errors');
const { compressDescriptionsInPlace } = require('./compress');
const { complete, activeProvider } = require('./llm');

const SAFE_MODE = process.env.SAFE_MODE !== 'false'; // Default to true

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

// Define tools available to LLMs — descriptions compressed via caveman rules to save input tokens
server.setRequestHandler(ListToolsRequestSchema, async () => {
  const tools = compressDescriptionsInPlace([
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
      },
      {
        name: 'octopus_execute_command',
        description: 'Execute arbitrary OS commands in the workspace (e.g., npm run test, uipro init --ai).',
        inputSchema: {
          type: 'object',
          properties: {
            command: { type: 'string', description: 'The shell command to run' },
            cwd: { type: 'string', description: 'Optional working directory' },
          },
          required: ['command'],
        },
      },
      {
        name: 'octopus_write_file',
        description: 'Write raw content to a file in the workspace.',
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Absolute or relative path to the file' },
            content: { type: 'string', description: 'The file contents to write' },
          },
          required: ['path', 'content'],
        },
      },
      {
        name: 'octopus_read_file',
        description: 'Read the contents of a file in the workspace.',
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Absolute or relative path to the file' },
          },
          required: ['path'],
        },
      },
      {
        name: 'octopus_create_agent',
        description: 'Dynamically create and hot-reload a new Octopus agent into the active registry.',
        inputSchema: {
          type: 'object',
          properties: {
            agentName: { type: 'string', description: 'Name of the new agent in camelCase (e.g. frontendDeveloper)' },
            role: { type: 'string', description: 'Role of the new agent' },
            javascriptLogic: { type: 'string', description: 'The full Node.js module implementation for the agent' },
          },
          required: ['agentName', 'role', 'javascriptLogic'],
        },
      },
      {
        name: 'octopus_scan_security',
        description: 'Scan an array of file paths for comprehensive cyberthreats and vulnerabilities.',
        inputSchema: {
          type: 'object',
          properties: {
            paths: { type: 'array', items: { type: 'string' }, description: 'List of absolute or relative file paths to scan' },
          },
          required: ['paths'],
        },
      },
      {
        name: 'octopus_llm_complete',
        description: 'Send a prompt to the active LLM provider (Anthropic, OpenAI, or Google) and return the completion.',
        inputSchema: {
          type: 'object',
          properties: {
            prompt:    { type: 'string',  description: 'Prompt to send to the LLM' },
            maxTokens: { type: 'number',  description: 'Max tokens in response (default 1024)' },
          },
          required: ['prompt'],
        },
      },
      {
        name: 'octopus_browser_navigate',
        description: 'Open a URL in the agent-browser and return a page snapshot (accessibility tree with element refs).',
        inputSchema: {
          type: 'object',
          properties: {
            url: { type: 'string', description: 'Fully-qualified URL to navigate to (e.g. https://example.com)' },
          },
          required: ['url'],
        },
      },
      {
        name: 'octopus_browser_snapshot',
        description: 'Capture the current accessibility tree snapshot from the active agent-browser session. Returns element refs (@e1, @e2 …) for interaction.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'octopus_browser_interact',
        description: 'Interact with the active browser page: click, fill a form field, type text, or evaluate JavaScript.',
        inputSchema: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              enum: ['click', 'fill', 'type', 'eval'],
              description: 'Action to perform',
            },
            ref: { type: 'string', description: 'Element ref from snapshot (e.g. @e3) or CSS selector' },
            value: { type: 'string', description: 'Text to fill/type, or JS expression to evaluate' },
          },
          required: ['action'],
        },
      },
  ]);
  return { tools };
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
        if (SAFE_MODE) {
          throw new OctopusError(KINDS.SYSTEM_ERROR, 'Tool disabled in SAFE_MODE');
        }
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
        if (SAFE_MODE) {
          throw new OctopusError(KINDS.SYSTEM_ERROR, 'Tool disabled in SAFE_MODE');
        }
        result = await memory.compactSession(args.summary, args.facts);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };

      case 'octopus_execute_command':
        if (SAFE_MODE) {
          throw new OctopusError(KINDS.SYSTEM_ERROR, 'Tool disabled in SAFE_MODE');
        }
        try {
          const output = execSync(args.command, { cwd: args.cwd || process.cwd(), encoding: 'utf8', stdio: 'pipe' });
          return { content: [{ type: 'text', text: output || 'Command executed successfully.' }] };
        } catch (execErr) {
          throw new OctopusError(KINDS.SYSTEM_ERROR, `Execution failed: ${execErr.message}`, null, { stderr: execErr.stderr });
        }

      case 'octopus_write_file':
        if (SAFE_MODE) {
          throw new OctopusError(KINDS.SYSTEM_ERROR, 'Tool disabled in SAFE_MODE');
        }
        fs.writeFileSync(args.path, args.content, 'utf8');
        return { content: [{ type: 'text', text: `File ${args.path} written successfully.` }] };

      case 'octopus_read_file':
        const fileContent = fs.readFileSync(args.path, 'utf8');
        return { content: [{ type: 'text', text: fileContent }] };

      case 'octopus_scan_security':
        // SAFE_MODE check not required since this is a read-only analysis tool
        const { scanSecurity } = require('./skills/security');
        const findings = scanSecurity(args.paths);
        return { content: [{ type: 'text', text: JSON.stringify(findings, null, 2) }] };

      case 'octopus_create_agent':
        if (SAFE_MODE) {
          throw new OctopusError(KINDS.SYSTEM_ERROR, 'Tool disabled in SAFE_MODE');
        }
        const agentPath = path.join(__dirname, 'agents', `${args.agentName}.js`);
        fs.writeFileSync(agentPath, args.javascriptLogic, 'utf8');
        injectAgent(args.agentName);
        return { content: [{ type: 'text', text: `Agent ${args.agentName} created and injected successfully.` }] };

      case 'octopus_llm_complete': {
        const text = await complete(args.prompt, { maxTokens: args.maxTokens });
        return { content: [{ type: 'text', text: JSON.stringify({ text, ...activeProvider() }, null, 2) }] };
      }

      case 'octopus_browser_navigate': {
        if (SAFE_MODE) {
          throw new OctopusError(KINDS.SYSTEM_ERROR, 'Tool disabled in SAFE_MODE');
        }
        result = await runAgent('navigator', { url: args.url, task: `Navigate to ${args.url}` }, memory);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      case 'octopus_browser_snapshot': {
        const navigator = require('./agents/navigator');
        const snap = await navigator.run({ task: 'snapshot' }, memory);
        return { content: [{ type: 'text', text: JSON.stringify(snap.snapshot, null, 2) }] };
      }

      case 'octopus_browser_interact': {
        if (SAFE_MODE) {
          throw new OctopusError(KINDS.SYSTEM_ERROR, 'Tool disabled in SAFE_MODE');
        }
        result = await runAgent('navigator', {
          action: args.action,
          ref: args.ref,
          value: args.value,
          task: `Browser ${args.action}${args.ref ? ` on ${args.ref}` : ''}`,
        }, memory);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      default:
        throw new OctopusError(KINDS.SYSTEM_ERROR, `Unknown tool: ${name}`);
    }
  } catch (error) {
    let errEnv;
    if (error instanceof OctopusError) {
      errEnv = error.envelope;
    } else {
      errEnv = formatError(KINDS.SYSTEM_ERROR, error.message || 'Unknown system error');
    }
    return {
      content: [{ type: 'text', text: JSON.stringify(errEnv, null, 2) }],
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
