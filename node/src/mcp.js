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
        const { provider } = args;
        const DASHBOARD_URLS = {
          anthropic: 'https://console.anthropic.com/settings/keys',
          openai:    'https://platform.openai.com/api-keys',
          google:    'https://aistudio.google.com/app/apikey',
        };
        const PROVIDER_LABELS = { anthropic: 'Anthropic', openai: 'OpenAI', google: 'Google' };

        const dashUrl = DASHBOARD_URLS[provider];
        if (!dashUrl) {
          throw new OctopusError(KINDS.SYSTEM_ERROR, `Unknown provider "${provider}". Valid: anthropic, openai, google`);
        }

        // Step 1: open provider dashboard in agent-browser
        try {
          await runAgent('navigator', { url: dashUrl, task: `Open ${provider} API key dashboard` }, memory);
        } catch (navErr) {
          console.error(`[octopus_login] Browser navigation skipped: ${navErr.message}`);
        }

        const vaultSetScript = path.join(__dirname, 'vault_set.js');

        // Step 2: platform-specific Authorize flow
        if (process.platform === 'win32') {
          // Windows: spawn a visible PS window — Read-Host -AsSecureString masks input
          const safeScript = vaultSetScript.replace(/\\/g, '\\\\');
          const psBody = [
            `Write-Host ''`,
            `Write-Host '  Octopus Authorize — ${PROVIDER_LABELS[provider]}' -ForegroundColor Cyan`,
            `Write-Host '  1. The browser has opened the ${PROVIDER_LABELS[provider]} API key page.'`,
            `Write-Host '  2. Copy or generate your API key there.'`,
            `Write-Host '  3. Paste it below and press Enter.'`,
            `Write-Host ''`,
            `$ss = Read-Host 'API key (hidden)' -AsSecureString`,
            `$p = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($ss))`,
            `$p | node \\"${safeScript}\\" ${provider}`,
            `Write-Host ''`,
            `Read-Host 'Press Enter to close'`,
          ].join('; ');

          try {
            await execAsync(
              `Start-Process -Wait powershell -ArgumentList '-NoProfile', '-Command', "${psBody}"`,
              { shell: 'powershell.exe', timeout: 120000 }
            );
          } catch (loginErr) {
            throw new OctopusError(KINDS.SYSTEM_ERROR, `Login window failed: ${loginErr.message}`);
          }
        } else if (process.platform === 'darwin') {
          // macOS: osascript password dialog
          const script = `tell app "System Events" to display dialog "Octopus Authorize — ${PROVIDER_LABELS[provider]}\\n\\nThe browser has opened the API key page.\\nCopy your key and paste it here:" with hidden answer default answer "" buttons {"Cancel","Authorize"} default button "Authorize"`;
          let stdout = '';
          try {
            ({ stdout } = await execAsync(`osascript -e "${script.replace(/"/g, '\\"')}"`, { timeout: 120000 }));
          } catch (err) {
            if (/cancel/i.test(err.message)) throw new OctopusError(KINDS.SYSTEM_ERROR, 'Login cancelled.');
            throw new OctopusError(KINDS.SYSTEM_ERROR, `osascript error: ${err.message}`);
          }
          const match = stdout.match(/text returned:(.+)/);
          if (!match || !match[1].trim()) throw new OctopusError(KINDS.SYSTEM_ERROR, 'No key entered — login cancelled.');
          const key = match[1].trim();
          await new Promise((resolve, reject) => {
            const child = require('child_process').spawn('node', [vaultSetScript, provider], {
              stdio: ['pipe', 'inherit', 'inherit'],
            });
            child.stdin.end(key);
            child.on('close', code => (code === 0 ? resolve() : reject(new Error(`vault_set exited ${code}`))));
          });
        } else {
          // Linux / other: return clear Authorize instructions
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                ok: false,
                action_required: true,
                provider,
                dashboard_url: dashUrl,
                authorize_steps: [
                  `1. The browser has opened: ${dashUrl}`,
                  `2. Generate or copy your ${PROVIDER_LABELS[provider]} API key from that page.`,
                  `3. Run this command to store it securely (no .env needed):`,
                  `   node "${vaultSetScript}" ${provider}`,
                  `   (You will be prompted to paste the key — input is hidden.)`,
                  `   Or pipe it directly: echo "your-key" | node "${vaultSetScript}" ${provider}`,
                ],
                message: `Authorize ${PROVIDER_LABELS[provider]}: follow the steps above to link your key to the OS Vault.`,
              }, null, 2),
            }],
          };
        }

        // Step 3: verify key landed in vault or session file
        const stored = await getSecureKey(provider);
        if (!stored) {
          throw new OctopusError(KINDS.SYSTEM_ERROR, 'Key not found after login — user may have cancelled.');
        }

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              ok: true,
              provider,
              message: `✅ ${PROVIDER_LABELS[provider]} linked via OS Vault. No .env required.`,
            }, null, 2),
          }],
        };
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
