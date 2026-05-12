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
const { exec }  = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const memory = require('./memory');
const { runTask } = require('./runner');
const { runAgent, injectAgent } = require('./agents');
const { KINDS, OctopusError, formatError } = require('./errors');
const { compressDescriptionsInPlace } = require('./compress');
const { complete, activeProvider, getSecureKey } = require('./llm');
const { TOOLS } = require('./tools');
const skillRegistry = require('./skill_registry');
const { preToolUse, postToolUse } = require('./hooks');

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
    // Deterministic PreToolUse hook — synchronous, zero tokens, blocks fatal commands
    preToolUse(name, args);

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

      case 'octopus_execute_command': {
        if (SAFE_MODE) {
          throw new OctopusError(KINDS.SYSTEM_ERROR, 'Tool disabled in SAFE_MODE');
        }
        try {
          const { stdout } = await execAsync(args.command, {
            cwd: args.cwd || process.cwd(),
            encoding: 'utf8',
            timeout: 30000,
          });
          return { content: [{ type: 'text', text: stdout || 'Command executed successfully.' }] };
        } catch (execErr) {
          throw new OctopusError(KINDS.SYSTEM_ERROR, `Execution failed: ${execErr.message}`, null, { stderr: execErr.stderr || '' });
        }
      }

      case 'octopus_write_file':
        if (SAFE_MODE) {
          throw new OctopusError(KINDS.SYSTEM_ERROR, 'Tool disabled in SAFE_MODE');
        }
        fs.writeFileSync(args.path, args.content, 'utf8');
        // PostToolUse hook — auto-format JS/TS files after write
        await postToolUse(name, args);
        return { content: [{ type: 'text', text: `File ${args.path} written successfully.` }] };

      case 'octopus_read_file':
        const fileContent = fs.readFileSync(args.path, 'utf8');
        return { content: [{ type: 'text', text: fileContent }] };

      case 'octopus_scan_security':
        // SAFE_MODE check not required since this is a read-only analysis tool
        const { scanSecurity } = require('./skills/security');
        const findings = scanSecurity(args.paths);
        return { content: [{ type: 'text', text: JSON.stringify(findings, null, 2) }] };

      case 'octopus_create_agent': {
        if (SAFE_MODE) {
          throw new OctopusError(KINDS.SYSTEM_ERROR, 'Tool disabled in SAFE_MODE');
        }
        // AS-A04 fix: validate agentName is safe before constructing path
        if (!/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(args.agentName || '')) {
          throw new OctopusError(
            KINDS.PERMISSION_DENIED,
            `Invalid agent name "${args.agentName}" — must be alphanumeric/underscore, start with a letter, max 64 chars`,
            null, { rule: 'AS-A04' }
          );
        }
        // agentName validated above — safe to use in path
        const sanitizedName = args.agentName;
        const agentSource   = args.javascriptLogic;
        const agentPath     = path.join(__dirname, 'agents', sanitizedName + '.js');
        fs.writeFileSync(agentPath, agentSource, 'utf8');
        injectAgent(sanitizedName);
        return { content: [{ type: 'text', text: `Agent ${args.agentName} created and injected successfully.` }] };
      }

      // ── Skill Evolution Pipeline ────────────────────────────────────────────
      case 'octopus_skill_scout': {
        result = await runAgent('marketscout', { topics: args.topics }, memory);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      case 'octopus_skill_synthesize': {
        if (SAFE_MODE) throw new OctopusError(KINDS.SYSTEM_ERROR, 'Tool disabled in SAFE_MODE');
        result = await runAgent('toolsmith', {
          name: args.name, doc_url: args.doc_url, description: args.description,
        }, memory);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      case 'octopus_skill_validate': {
        if (SAFE_MODE) throw new OctopusError(KINDS.SYSTEM_ERROR, 'Tool disabled in SAFE_MODE');
        result = await runAgent('sandboxqa', { skill_id: args.skill_id }, memory);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      case 'octopus_skill_deploy': {
        if (SAFE_MODE) throw new OctopusError(KINDS.SYSTEM_ERROR, 'Tool disabled in SAFE_MODE');
        if (args.retires) skillRegistry.retire(args.retires, `Superseded by ${args.skill_id}`);
        result = skillRegistry.deploy(args.skill_id);
        return { content: [{ type: 'text', text: JSON.stringify({ ok: true, skill: result }, null, 2) }] };
      }

      case 'octopus_skill_retire': {
        if (SAFE_MODE) throw new OctopusError(KINDS.SYSTEM_ERROR, 'Tool disabled in SAFE_MODE');
        result = skillRegistry.retire(args.skill_id, args.reason || '');
        return { content: [{ type: 'text', text: JSON.stringify({ ok: true, skill: result }, null, 2) }] };
      }

      case 'octopus_skill_list': {
        result = skillRegistry.listSkills(args.status || null);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

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

      case 'octopus_login': {
        // vault_login.js is an interactive enquirer menu; spawn it in a new visible terminal window.
        const vaultLoginScript = path.join(__dirname, 'vault_login.js');
        const provider = (args || {}).provider || '';

        // Open browser to the provider dashboard (best-effort; non-blocking)
        const DASHBOARD_URLS = {
          anthropic:   'https://console.anthropic.com/settings/keys',
          openai:      'https://platform.openai.com/api-keys',
          google:      'https://aistudio.google.com/app/apikey',
          nvidia:      'https://build.nvidia.com/settings/api-key',
          huggingface: 'https://huggingface.co/settings/tokens',
        };
        if (DASHBOARD_URLS[provider]) {
          try {
            await runAgent('navigator', { url: DASHBOARD_URLS[provider], task: `Open ${provider} API key dashboard` }, memory);
          } catch (navErr) {
            console.error(`[octopus_login] Browser navigation skipped: ${navErr.message}`);
          }
        }

        if (process.platform === 'win32') {
          // Windows: spawn a new PS window running vault_login.js (enquirer menu + masked input)
          const safe = vaultLoginScript.replace(/\\/g, '\\\\');
          try {
            await execAsync(
              `Start-Process -Wait powershell -ArgumentList '-NoProfile', '-Command', "node \\"${safe}\\""`,
              { shell: 'powershell.exe', timeout: 180000 }
            );
          } catch (err) {
            throw new OctopusError(KINDS.SYSTEM_ERROR, `Login window failed: ${err.message}`);
          }
        } else if (process.platform === 'darwin') {
          // macOS: open a new Terminal.app tab running vault_login.js
          try {
            await execAsync(
              `osascript -e 'tell application "Terminal" to do script "node ${vaultLoginScript.replace(/'/g, "'\\''")}"'`,
              { timeout: 10000 }
            );
            // Give the user up to 3 minutes; we poll vault for their key
            for (let i = 0; i < 36; i++) {
              await new Promise(r => setTimeout(r, 5000));
              const key = await getSecureKey(provider || 'anthropic');
              if (key) break;
            }
          } catch (err) {
            throw new OctopusError(KINDS.SYSTEM_ERROR, `Terminal launch failed: ${err.message}`);
          }
        } else {
          // Linux / other: return clear Authorize instructions with vault_login.js command
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                ok: false, action_required: true,
                authorize_command: `node "${vaultLoginScript}"`,
                message: 'Run the authorize command in a terminal to complete Zero-Key setup.',
              }, null, 2),
            }],
          };
        }

        const stored = provider ? await getSecureKey(provider) : true;
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              ok: true,
              message: stored
                ? `✅ Provider linked via OS Vault. No .env required.`
                : 'Login window closed. Run octopus_vault_check to verify key storage.',
            }, null, 2),
          }],
        };
      }

      case 'octopus_vault_check': {
        const providers = ['anthropic', 'openai', 'google', 'nvidia', 'huggingface'];
        const keyChecks = await Promise.all(
          providers.map(async p => {
            const key = await getSecureKey(p);
            return [p, key ? 'present' : 'missing'];
          })
        );
        const vault = Object.fromEntries(keyChecks);

        let ollamaStatus = 'offline';
        try {
          await axios.get(`${process.env.OLLAMA_BASE_URL || 'http://localhost:11434'}/api/tags`, { timeout: 2000 });
          ollamaStatus = 'running';
        } catch { /* offline */ }

        const activeProvider = (process.env.LLM_PROVIDER || 'anthropic').toLowerCase();
        const sovereignActive = vault[activeProvider] === 'missing' && ollamaStatus === 'running';

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              vault,
              ollama: ollamaStatus,
              active_provider: activeProvider,
              sovereign_fallback: sovereignActive ? 'active (routing to Ollama gemma4:e2b)' : 'inactive',
              advice: sovereignActive
                ? 'No cloud key — Sovereign Fallback will route calls to local Ollama automatically.'
                : Object.values(vault).every(v => v === 'missing')
                  ? 'No keys configured. Run octopus_login to authorize a provider.'
                  : `Keys present for: ${Object.entries(vault).filter(([,v]) => v === 'present').map(([k]) => k).join(', ')}`,
            }, null, 2),
          }],
        };
      }

      case 'octopus_task_routes': {
        const taskRouter = require('./task_router');
        const routes     = taskRouter.summarise();
        const activeMode = (process.env.LLM_PROVIDER || 'anthropic').toLowerCase();
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              router_active: activeMode === 'router',
              current_provider: activeMode,
              enable_router: 'Set LLM_PROVIDER=router in node/.env to activate task routing',
              routes: routes.map(r => ({
                role:        r.role,
                agents:      r.agents,
                provider:    r.provider,
                model:       r.model,
                description: r.description,
                overridden:  r.overridden,
              })),
            }, null, 2),
          }],
        };
      }

      case 'octopus_memory_status': {
        const serviceUrl = process.env.MEMORY_SERVICE_URL || 'http://localhost:5000';
        try {
          const res = await axios.get(`${serviceUrl}/health`, { timeout: 3000 });
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({ ok: true, url: serviceUrl, response: res.data }, null, 2),
            }],
          };
        } catch (err) {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                ok: false, url: serviceUrl, error: err.message,
                hint: 'Start the memory service: py python/services/memory_service.py',
              }, null, 2),
            }],
          };
        }
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
