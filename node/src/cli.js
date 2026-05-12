#!/usr/bin/env node
'use strict';
/**
 * cli.js — Octopus Interactive Terminal UI
 *
 * Usage:
 *   octopus              (if installed via npm link / PATH)
 *   node node/src/cli.js
 *
 * Commands:
 *   /plan  <task>   — plan a task (Cortex only, no execution)
 *   /run   <task>   — run the full agent chain
 *   /agents         — list all 14 agents + roles
 *   /models         — show installed Ollama models
 *   /routes         — show task router config
 *   /vault          — check OS Vault key status
 *   /status         — show all service health
 *   /update         — check GitHub for updates
 *   /update-models  — re-pull all Ollama models
 *   /help           — this help
 *   /exit           — quit
 */

const readline = require('readline');
const path     = require('path');
const fs       = require('fs');
const axios    = require('axios');
const chalk    = require('chalk');

const REPO_ROOT      = path.resolve(__dirname, '..', '..');
const MEMORY_URL     = process.env.MEMORY_SERVICE_URL || 'http://localhost:5000';
const OLLAMA_URL     = process.env.OLLAMA_BASE_URL    || 'http://localhost:11434';
const PROVIDER       = (process.env.LLM_PROVIDER || 'ollama').toLowerCase();
const MODEL          = process.env.LLM_MODEL || 'gemma4:e2b';

// ── Spinner ────────────────────────────────────────────────────────────────────
const SPIN = ['⠋','⠙','⠹','⠸','⠼','⠴','⠦','⠧','⠇','⠏'];
let _spinnerIdx = 0;
let _spinnerTimer = null;

function startSpinner(label) {
  process.stdout.write('\n');
  _spinnerTimer = setInterval(() => {
    process.stdout.write(`\r  ${chalk.cyan(SPIN[_spinnerIdx++ % SPIN.length])} ${label}   `);
  }, 80);
}
function stopSpinner(label, ok = true) {
  if (_spinnerTimer) { clearInterval(_spinnerTimer); _spinnerTimer = null; }
  const icon = ok ? chalk.green('✓') : chalk.red('✗');
  process.stdout.write(`\r  ${icon} ${label}                  \n`);
}

// ── Status checks ──────────────────────────────────────────────────────────────
async function checkMemory() {
  try {
    const r = await axios.get(`${MEMORY_URL}/health`, { timeout: 3000 });
    return { ok: true, data: r.data };
  } catch { return { ok: false }; }
}

async function checkOllama() {
  try {
    const r = await axios.get(`${OLLAMA_URL}/api/tags`, { timeout: 3000 });
    return { ok: true, models: (r.data?.models || []).map(m => m.name) };
  } catch { return { ok: false, models: [] }; }
}

async function checkVault() {
  const { getSecureKey } = require('./llm');
  const providers = ['anthropic', 'openai', 'google', 'nvidia', 'huggingface'];
  const results = {};
  for (const p of providers) {
    const k = await getSecureKey(p);
    results[p] = k ? chalk.green('key present') : chalk.dim('no key');
  }
  return results;
}

// ── Banner + Status ────────────────────────────────────────────────────────────
async function showBanner() {
  const { currentCommit, currentVersion, checkForUpdate } = require('./updater');
  const ver    = currentVersion();
  const commit = currentCommit();

  console.clear();
  console.log(chalk.cyan('━'.repeat(56)));
  console.log(chalk.bold.cyan('  🐙  OCTOPUS') + chalk.dim(`  v${ver}  |  24 tools  |  14 agents  |  Smart Router`));
  console.log(chalk.cyan('━'.repeat(56)));

  // Services
  const [mem, oll] = await Promise.all([checkMemory(), checkOllama()]);
  const memIcon  = mem.ok  ? chalk.green('✅') : chalk.red('❌');
  const ollIcon  = oll.ok  ? chalk.green('✅') : chalk.yellow('⚠️ ');
  const provIcon = chalk.green('✅');

  console.log(`  ${memIcon} Memory service   ${chalk.dim(MEMORY_URL)}`);
  console.log(`  ${ollIcon} Ollama           ${oll.ok ? chalk.green(`${oll.models.length} model(s)`) : chalk.yellow('offline — start with: ollama serve')}`);
  if (oll.ok && oll.models.length) {
    const active = oll.models.find(m => m === MODEL) ? chalk.green(MODEL) : chalk.yellow(MODEL + ' (not pulled)');
    console.log(`  ${provIcon} Active model     ${active}  ${chalk.dim(`[${PROVIDER}]`)}`);
  }

  // Update check (non-blocking)
  checkForUpdate().then(upd => {
    if (upd.hasUpdate) {
      console.log(`\n  ${chalk.yellow('⬆')} Update available: ${chalk.dim(upd.local)} → ${chalk.cyan(upd.remote)}`);
      console.log(`    ${chalk.dim(upd.message)}`);
      console.log(`    ${chalk.yellow('/update')} to apply`);
    } else {
      console.log(`  ${chalk.green('✅')} Version          ${chalk.dim(commit)}  ${upd.error ? chalk.yellow('(offline check)') : chalk.green('up to date')}`);
    }
    console.log(chalk.cyan('━'.repeat(56)));
    printHelp(true);
    prompt();
  }).catch(() => {
    console.log(chalk.cyan('━'.repeat(56)));
    printHelp(true);
    prompt();
  });
}

function printHelp(short = false) {
  if (short) {
    console.log(chalk.dim('\n  /plan  /run  /agents  /models  /provider  /headless  /vault  /status  /dashboard  /update  /help\n'));
    return;
  }
  console.log('\n' + chalk.bold('  Commands:'));
  const cmds = [
    ['/plan <task>',          'Plan a task (Cortex only, shows the agent chain)'],
    ['/run  <task>',          'Run the full agent chain end-to-end'],
    ['/agents',               'List all 14 agents and their roles'],
    ['/models',               'Show installed Ollama models'],
    ['/routes',               'Full task router — which model each agent uses'],
    ['/provider',             'Show active LLM provider/model'],
    ['/provider list',        'List all configured providers + key status'],
    ['/provider set <p> [m]', 'Switch provider (and optionally model) in .env'],
    ['/headless',             'Show current HEADLESS_MODE setting'],
    ['/headless on',          'Enable headless mode (external LLM as planner)'],
    ['/headless off',         'Disable headless mode (Cortex as planner)'],
    ['/vault',                'Check OS Vault key status (all providers)'],
    ['/status',               'Health check all services'],
    ['/dashboard',            'Open the web dashboard in your browser'],
    ['/update',               'Check GitHub for updates and apply'],
    ['/update-models',        'Re-pull all Ollama models (checks for new versions)'],
    ['/help',                 'Show this help'],
    ['/exit',                 'Quit'],
  ];
  for (const [cmd, desc] of cmds) {
    console.log(`    ${chalk.cyan(cmd.padEnd(28))} ${chalk.dim(desc)}`);
  }
  console.log();
}

// ── .env read/write helpers ────────────────────────────────────────────────────
const ENV_PATH = path.join(__dirname, '..', '.env');

function readEnvFile() {
  try { return fs.readFileSync(ENV_PATH, 'utf8'); } catch { return ''; }
}

function setEnvVar(key, value) {
  let content = readEnvFile();
  const re = new RegExp(`^(${key}=).*$`, 'm');
  if (re.test(content)) {
    content = content.replace(re, `$1${value}`);
  } else {
    content = content.trimEnd() + `\n${key}=${value}\n`;
  }
  try {
    fs.writeFileSync(ENV_PATH, content, 'utf8');
    return true;
  } catch (err) {
    console.log(chalk.red(`  Could not write .env: ${err.message}\n`));
    return false;
  }
}

function getEnvVar(key) {
  const match = readEnvFile().match(new RegExp(`^${key}=(.*)$`, 'm'));
  return match ? match[1].trim() : (process.env[key] || '');
}

// ── Provider helpers ───────────────────────────────────────────────────────────
const ALL_PROVIDERS = ['anthropic', 'openai', 'google', 'ollama', 'nvidia', 'huggingface', 'custom_http', 'router'];
const PROVIDER_DOCS = {
  anthropic:   'Claude (claude-sonnet-4-6)                ANTHROPIC_API_KEY',
  openai:      'GPT-4o                                     OPENAI_API_KEY',
  google:      'Gemini 2.0 Flash                           GOOGLE_API_KEY',
  ollama:      'Ollama local (gemma4:e2b)                  no key needed',
  nvidia:      'NVIDIA NIM (llama-3.1-405b)                NVIDIA_API_KEY  free at build.nvidia.com',
  huggingface: 'HuggingFace Inference API (gemma-3-4b-it)  HF_TOKEN  free at huggingface.co',
  custom_http: 'Custom OpenAI-compat server                CUSTOM_HTTP_URL + CUSTOM_HTTP_MODEL',
  router:      'Smart per-agent router                     uses best provider per agent role',
};

// ── Prompt ─────────────────────────────────────────────────────────────────────
let rl;

function prompt() {
  if (!rl) return;
  rl.setPrompt(chalk.cyan('❯ '));
  rl.prompt();
}

// ── Agent runner with live output ──────────────────────────────────────────────
async function runPlan(task) {
  startSpinner(`Cortex planning: ${chalk.white(task)}`);
  try {
    const memory    = require('./memory');
    const { runAgent } = require('./agents');
    const result    = await runAgent('cortex', { task, query: task }, memory);
    stopSpinner('Cortex planning complete');

    if (result?.plan) {
      console.log(chalk.bold('\n  Execution plan:'));
      result.plan.forEach((step, i) => {
        console.log(`    ${chalk.cyan(`${i + 1}.`)} ${chalk.white(step.agent)} ${chalk.dim('— ' + (step.reason || ''))}`);
      });
      console.log(`\n  ${chalk.dim('Run with /run ' + task + ' to execute all agents.')}\n`);
    } else {
      console.log('  ' + JSON.stringify(result, null, 2));
    }
  } catch (err) {
    stopSpinner('Planning failed', false);
    console.log(chalk.red(`  Error: ${err.message}\n`));
  }
}

async function runTask(task) {
  console.log(chalk.bold(`\n  Running: ${chalk.cyan(task)}\n`));
  try {
    const memory = require('./memory');
    const { runTask: execTask } = require('./runner');

    // Patch console.error to show agent progress live
    const origErr = console.error.bind(console);
    console.error = (...args) => {
      const msg = args.join(' ');
      if (msg.includes('[runner] Spawning')) {
        const agent = msg.replace('[runner] Spawning', '').replace('…', '').trim();
        process.stdout.write(`  ${chalk.cyan('→')} ${chalk.white(agent)}...\n`);
      } else if (msg.includes('[runner] Parallel stage')) {
        const agents = msg.replace('[runner] Parallel stage:', '').replace(/[\[\]]/g, '').trim();
        process.stdout.write(`  ${chalk.magenta('⟦')} ${chalk.white(agents)} ${chalk.magenta('⟧')}  ${chalk.dim('(parallel)')}\n`);
      } else if (msg.includes('[runner] Task:')) {
        // skip
      } else if (msg.startsWith('[llm] router:')) {
        const parts = msg.replace('[llm] router:', '').trim();
        process.stdout.write(`    ${chalk.dim('→ ' + parts)}\n`);
      } else {
        origErr(...args);
      }
    };

    const result = await execTask(task, memory);
    console.error = origErr;

    const approved = Object.values(result.results || {}).filter(r => r?.approved === true).length;
    const errCount = (result.errors || []).length;

    console.log(chalk.bold(`\n  ${chalk.green('✅')} Complete — ${approved} agents approved, ${errCount} errors`));
    if (errCount > 0) {
      result.errors.forEach(e => console.log(`    ${chalk.red('✗')} ${e.agent}: ${e.error}`));
    }
    if (result.tool_call_count) {
      console.log(chalk.dim(`  Tool calls: ${result.tool_call_count}`));
    }
    console.log();

  } catch (err) {
    console.log(chalk.red(`\n  Error: ${err.message}\n`));
  }
}

// ── Commands ───────────────────────────────────────────────────────────────────
async function handleCommand(input) {
  const trimmed = input.trim();
  if (!trimmed) return;

  // Plain text (no slash) = run task
  if (!trimmed.startsWith('/')) {
    await runTask(trimmed);
    return;
  }

  const [cmd, ...rest] = trimmed.slice(1).split(' ');
  const arg = rest.join(' ').trim();

  switch (cmd.toLowerCase()) {

    case 'plan':
      if (!arg) { console.log(chalk.yellow('  Usage: /plan <task description>\n')); break; }
      await runPlan(arg);
      break;

    case 'run':
      if (!arg) { console.log(chalk.yellow('  Usage: /run <task description>\n')); break; }
      await runTask(arg);
      break;

    case 'agents': {
      const { listAgents } = require('./agents');
      const agents = listAgents();
      console.log(chalk.bold('\n  Agents:'));
      agents.forEach(a => {
        const gate = a.canApprove ? chalk.red(' [gate]') : '';
        console.log(`    ${chalk.cyan(a.name.padEnd(22))} ${chalk.dim(a.role)}${gate}`);
      });
      console.log();
      break;
    }

    case 'models': {
      const oll = await checkOllama();
      console.log(chalk.bold('\n  Ollama models:'));
      if (!oll.ok) {
        console.log(chalk.yellow('  Ollama offline. Start with: ollama serve'));
      } else {
        oll.models.forEach(m => {
          const active = m === MODEL ? chalk.green(' ← active') : '';
          console.log(`    ${chalk.cyan(m)}${active}`);
        });
      }
      console.log(chalk.dim(`\n  Pull more: ollama pull gemma4:26b  |  ollama pull gemma4:31b`));
      console.log(chalk.dim(`  See full guide: /routes\n`));
      break;
    }

    case 'routes': {
      const taskRouter = require('./task_router');
      const routes     = taskRouter.summarise();
      const active     = PROVIDER === 'router';
      console.log(chalk.bold('\n  Task Router') + (active ? chalk.green('  [ACTIVE]') : chalk.yellow('  [inactive — set LLM_PROVIDER=router]')));
      console.log();
      for (const r of routes) {
        const agents = r.agents.length ? chalk.dim(`  agents: ${r.agents.join(', ')}`) : '';
        const ov = r.overridden ? chalk.yellow(' [overridden]') : '';
        console.log(`    ${chalk.cyan(r.role.padEnd(18))} ${chalk.white(r.provider + ':' + r.model)}${ov}`);
        if (agents) console.log(`    ${' '.repeat(18)} ${agents}`);
      }
      console.log();
      if (!active) console.log(chalk.dim('  Enable: set LLM_PROVIDER=router in node/.env\n'));
      break;
    }

    case 'provider': {
      const sub = arg.toLowerCase().split(' ')[0];
      const extra = arg.split(' ').slice(1).join(' ').trim();

      if (!sub || sub === 'show') {
        // Show current active provider
        const p = getEnvVar('LLM_PROVIDER') || 'anthropic';
        const m = getEnvVar('LLM_MODEL') || chalk.dim('(provider default)');
        const hm = getEnvVar('HEADLESS_MODE') === 'true';
        console.log(chalk.bold('\n  Active LLM provider:'));
        console.log(`    Provider   ${chalk.cyan(p)}`);
        console.log(`    Model      ${chalk.cyan(m)}`);
        console.log(`    Headless   ${hm ? chalk.orange('on') : chalk.dim('off')}`);
        if (p === 'custom_http') {
          console.log(`    URL        ${chalk.cyan(getEnvVar('CUSTOM_HTTP_URL') || chalk.red('NOT SET'))}`);
        }
        console.log(chalk.dim('\n  /provider list  to see all  |  /provider set <p> [model]  to switch\n'));
        break;
      }

      if (sub === 'list') {
        const { getSecureKey } = require('./llm');
        const currentP = getEnvVar('LLM_PROVIDER') || 'anthropic';
        console.log(chalk.bold('\n  Available LLM providers:\n'));
        for (const p of ALL_PROVIDERS) {
          const active = p === currentP ? chalk.green(' ← active') : '';
          const doc = PROVIDER_DOCS[p] || '';
          // Check key availability (async, suppress for non-keyed providers)
          const needsKey = !['ollama', 'router'].includes(p);
          console.log(`    ${chalk.cyan(p.padEnd(14))} ${chalk.dim(doc)}${active}`);
        }
        console.log(chalk.dim('\n  To switch: /provider set ollama gemma4:e2b\n'));
        break;
      }

      if (sub === 'set') {
        // arg = "set ollama gemma4:e2b"  or  "set anthropic"
        const parts = arg.split(' ').slice(1);  // remove 'set'
        const newProvider = parts[0]?.toLowerCase();
        const newModel    = parts.slice(1).join(' ').trim();

        if (!newProvider || !ALL_PROVIDERS.includes(newProvider)) {
          console.log(chalk.yellow(`  Usage: /provider set <provider> [model]`));
          console.log(chalk.dim(`  Providers: ${ALL_PROVIDERS.join(', ')}\n`));
          break;
        }

        setEnvVar('LLM_PROVIDER', newProvider);
        if (newModel) setEnvVar('LLM_MODEL', newModel);

        console.log(chalk.green(`\n  ✅ Set LLM_PROVIDER=${newProvider}${newModel ? ` LLM_MODEL=${newModel}` : ''}`));
        console.log(chalk.yellow('  ⚠  Changes take effect after restarting Octopus.\n'));
        break;
      }

      console.log(chalk.yellow(`  Usage: /provider  |  /provider list  |  /provider set <p> [model]\n`));
      break;
    }

    case 'headless': {
      const current = getEnvVar('HEADLESS_MODE') === 'true';

      if (!arg) {
        console.log(chalk.bold('\n  HEADLESS_MODE:'));
        console.log(`    Current:   ${current ? chalk.orange('on  (external LLM is planner)') : chalk.green('off (Cortex is planner)')}`);
        console.log(chalk.dim('\n  /headless on   — external LLM (Claude, Cursor, Windsurf) calls octopus_* tools'));
        console.log(chalk.dim('  /headless off  — Cortex auto-plans and runs chains\n'));
        break;
      }

      if (arg === 'on' || arg === 'true') {
        setEnvVar('HEADLESS_MODE', 'true');
        console.log(chalk.orange('\n  ⚡ HEADLESS_MODE enabled.'));
        console.log(chalk.dim('  Cortex will not auto-plan. External LLM calls octopus_* MCP tools directly.'));
        console.log(chalk.yellow('  Restart Octopus for this to take effect.\n'));
      } else if (arg === 'off' || arg === 'false') {
        setEnvVar('HEADLESS_MODE', 'false');
        console.log(chalk.green('\n  ✅ HEADLESS_MODE disabled.'));
        console.log(chalk.dim('  Cortex is the planner. Chains run automatically from /run <task>.'));
        console.log(chalk.yellow('  Restart Octopus for this to take effect.\n'));
      } else {
        console.log(chalk.yellow('  Usage: /headless  |  /headless on  |  /headless off\n'));
      }
      break;
    }

    case 'dashboard': {
      const portVal = process.env.PORT || 3001;
      const url = `http://localhost:${portVal}/dashboard`;
      console.log(chalk.bold(`\n  🐙 OctoDeck Dashboard`));
      console.log(`    ${chalk.cyan(url)}`);
      console.log(chalk.dim('\n  Open the URL above in your browser.'));
      console.log(chalk.dim('  The server must be running (node src/server.js).\n'));
      // Try to open in default browser
      const { exec: execBrowser } = require('child_process');
      const openCmd = process.platform === 'win32' ? `start ${url}` : process.platform === 'darwin' ? `open ${url}` : `xdg-open ${url}`;
      execBrowser(openCmd, { timeout: 3000 }, () => {});
      break;
    }

    case 'vault': {
      startSpinner('Checking OS Vault...');
      const vault = await checkVault();
      stopSpinner('Vault check complete');
      console.log(chalk.bold('\n  OS Vault status:'));
      for (const [provider, status] of Object.entries(vault)) {
        console.log(`    ${chalk.cyan(provider.padEnd(16))} ${status}`);
      }
      console.log(chalk.dim('\n  Authorize: /run octopus_login  or  type: octopus_login in your AI chat\n'));
      break;
    }

    case 'status': {
      startSpinner('Checking services...');
      const [mem, oll] = await Promise.all([checkMemory(), checkOllama()]);
      stopSpinner('Status check complete');
      console.log(chalk.bold('\n  Services:'));
      console.log(`    Memory   ${mem.ok ? chalk.green('✅ online') : chalk.red('❌ offline')}  ${chalk.dim(MEMORY_URL)}`);
      console.log(`    Ollama   ${oll.ok ? chalk.green(`✅ ${oll.models.length} models`) : chalk.yellow('⚠️  offline')}  ${chalk.dim(OLLAMA_URL)}`);
      console.log(`    Provider ${chalk.cyan(PROVIDER)}  ${chalk.dim('model: ' + MODEL)}`);
      console.log();
      if (!mem.ok) console.log(chalk.yellow('  Start memory: py python/services/memory_service.py'));
      if (!oll.ok) console.log(chalk.yellow('  Start Ollama: ollama serve'));
      console.log();
      break;
    }

    case 'update': {
      const { checkForUpdate, applyUpdate } = require('./updater');
      startSpinner('Checking for updates...');
      const upd = await checkForUpdate();
      stopSpinner('Update check complete');
      if (upd.error) { console.log(chalk.yellow(`  Could not check: ${upd.error}\n`)); break; }
      if (!upd.hasUpdate) {
        console.log(chalk.green(`\n  Already up to date (${upd.local})\n`));
        break;
      }
      console.log(chalk.yellow(`\n  Update available: ${upd.local} → ${chalk.cyan(upd.remote)}`));
      console.log(`  ${chalk.dim(upd.message)}\n`);
      console.log(chalk.dim('  Applying update...'));
      const res = await applyUpdate(msg => console.log(chalk.dim(msg)));
      if (res.ok) {
        console.log(chalk.green('\n  ✅ Updated. Please restart Octopus.\n'));
        process.exit(0);
      } else {
        console.log(chalk.red(`\n  Update failed: ${res.error}\n`));
      }
      break;
    }

    case 'update-models': {
      const { listOllamaModels, updateOllamaModels } = require('./updater');
      const models = await listOllamaModels();
      if (!models.length) { console.log(chalk.yellow('\n  No models installed. Run: ollama pull gemma4:e2b\n')); break; }
      console.log(chalk.bold(`\n  Re-pulling ${models.length} model(s) to check for updates...\n`));
      const results = await updateOllamaModels(models, msg => console.log(chalk.dim(msg)));
      results.forEach(r => {
        const icon = r.ok ? chalk.green('✅') : chalk.red('❌');
        console.log(`  ${icon} ${r.model}  ${chalk.dim(r.output)}`);
      });
      console.log();
      break;
    }

    case 'help':
      printHelp();
      break;

    case 'exit':
    case 'quit':
      console.log(chalk.cyan('\n  Goodbye 🐙\n'));
      process.exit(0);
      break;

    case 'clear':
      showBanner();
      return;

    default:
      console.log(chalk.yellow(`  Unknown command: /${cmd}. Type /help for a list.\n`));
  }
}

// ── Main ────────────────────────────────────────────────────────────────────────
async function main() {
  rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  rl.on('line', async (input) => {
    rl.pause();
    await handleCommand(input);
    prompt();
    rl.resume();
  });
  rl.on('close', () => { console.log(chalk.cyan('\n  Goodbye 🐙\n')); process.exit(0); });

  await showBanner();
}

main().catch(err => { console.error(chalk.red('Fatal: ' + err.message)); process.exit(1); });
