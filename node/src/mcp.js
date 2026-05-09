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
const { TOOLS } = require('./tools');

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

// Tool list served from single source of truth (tools.js), compressed via caveman rules
server.setRequestHandler(ListToolsRequestSchema, async () => {
  const tools = compressDescriptionsInPlace(JSON.parse(JSON.stringify(TOOLS)));
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
